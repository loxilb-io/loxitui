import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { schemaRegistry } from "../../src/yaml/schema/registry.js";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return parse(raw);
}

describe("Valid resource validation", () => {
  test("valid-loadbalancer.yaml passes LoadBalancer schema validation", () => {
    const data = loadFixture("valid-loadbalancer.yaml");
    const result = schemaRegistry.validate("LoadBalancer", data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("valid-firewall.yaml passes Firewall schema validation", () => {
    const data = loadFixture("valid-firewall.yaml");
    const result = schemaRegistry.validate("Firewall", data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("valid-bgp-neighbor.yaml passes BgpNeighbor schema validation", () => {
    const data = loadFixture("valid-bgp-neighbor.yaml");
    const result = schemaRegistry.validate("BgpNeighbor", data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("Invalid resource validation", () => {
  test("invalid-loadbalancer.yaml fails validation", () => {
    const data = loadFixture("invalid-loadbalancer.yaml");
    const result = schemaRegistry.validate("LoadBalancer", data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("invalid-loadbalancer.yaml errors mention field paths", () => {
    const data = loadFixture("invalid-loadbalancer.yaml");
    const result = schemaRegistry.validate("LoadBalancer", data);
    const errorText = result.errors.join(" ");
    // Should mention problematic fields
    expect(
      errorText.includes("serviceArguments") ||
        errorText.includes("port") ||
        errorText.includes("endpoints") ||
        errorText.includes("type")
    ).toBe(true);
  });
});

describe("Schema compilation completeness", () => {
  test("all kinds have schemas with $schema property", () => {
    const kinds = schemaRegistry.allKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(34);

    for (const kind of kinds) {
      const schema = schemaRegistry.lookup(kind);
      expect(schema).toBeDefined();
      expect((schema!.jsonSchema as Record<string, unknown>)["$schema"]).toBe(
        "https://json-schema.org/draft/2020-12/schema"
      );
    }
  });
});

describe("Description preservation (SCHM-04)", () => {
  test("LoadBalancer schema has description on properties", () => {
    const schema = schemaRegistry.lookup("LoadBalancer");
    expect(schema).toBeDefined();

    const props = (schema!.jsonSchema as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    const saProps = props.serviceArguments.properties as Record<string, Record<string, unknown>>;
    const externalIPDesc = saProps.externalIP.description as string;
    expect(typeof externalIPDesc).toBe("string");
    expect(externalIPDesc.length).toBeGreaterThan(0);
  });
});

describe("Nullable type handling (SCHM-03)", () => {
  test("AiApiKey has nullable type arrays for x-nullable fields", () => {
    const schema = schemaRegistry.lookup("AiApiKey");
    expect(schema).toBeDefined();

    const props = (schema!.jsonSchema as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    // enabled should have type: ["boolean", "null"]
    const enabledType = props.enabled?.type;
    expect(Array.isArray(enabledType)).toBe(true);
    expect(enabledType as string[]).toContain("null");
  });
});

describe("$ref resolution (SCHM-03)", () => {
  test("Firewall schema has no unresolved $ref strings", () => {
    const schema = schemaRegistry.lookup("Firewall");
    expect(schema).toBeDefined();

    const raw = JSON.stringify(schema!.jsonSchema);
    expect(raw).not.toContain('"$ref"');
  });
});

describe("Singleton resource validation", () => {
  test("SecurityRate schema validates without crash on empty object", () => {
    const result = schemaRegistry.validate("SecurityRate", {});
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe("Domain grouping", () => {
  test("kindsByDomain returns correct groupings", () => {
    expect(schemaRegistry.kindsByDomain("core")).toContain("LoadBalancer");
    expect(schemaRegistry.kindsByDomain("security")).toContain("Firewall");
    expect(schemaRegistry.kindsByDomain("bgp")).toContain("BgpNeighbor");
    expect(schemaRegistry.kindsByDomain("network")).toContain("Route");
    expect(schemaRegistry.kindsByDomain("ipsec")).toContain("IpsecTunnel");
    expect(schemaRegistry.kindsByDomain("ai-gateway")).toContain("AiApiKey");
    expect(schemaRegistry.kindsByDomain("system")).toContain("Params");
    expect(schemaRegistry.kindsByDomain("observability")).toContain("Bfd");
  });
});
