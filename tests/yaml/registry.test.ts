import { describe, expect, test } from "bun:test";
import { SchemaRegistry, schemaRegistry } from "../../src/yaml/schema/registry.js";

describe("SchemaRegistry", () => {
  test("is a singleton (same instance returned)", () => {
    // schemaRegistry is the singleton; verify it is an instance of SchemaRegistry
    expect(schemaRegistry).toBeInstanceOf(SchemaRegistry);
  });

  test("lookup returns ResourceSchema for LoadBalancer", () => {
    const schema = schemaRegistry.lookup("LoadBalancer");
    expect(schema).toBeDefined();
    expect(schema!.kind).toBe("LoadBalancer");
    expect(schema!.apiEndpoint).toBe("/config/loadbalancer");
    expect(schema!.identityFields).toEqual(["externalIP", "port", "protocol"]);
    expect(schema!.domainGroup).toBe("core");
    expect(schema!.jsonSchema).toBeDefined();
    expect(schema!.enumMaps).toBeDefined();
  });

  test("lookup returns undefined for unknown kind", () => {
    expect(schemaRegistry.lookup("UnknownKind")).toBeUndefined();
    expect(schemaRegistry.lookup("nonexistent")).toBeUndefined();
  });

  test("allKinds returns all registered kind strings", () => {
    const kinds = schemaRegistry.allKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(35);
    expect(kinds).toContain("LoadBalancer");
    expect(kinds).toContain("Firewall");
    expect(kinds).toContain("BgpNeighbor");
    expect(kinds).toContain("Route");
  });

  test("kindsByDomain returns correct kinds for core", () => {
    const coreKinds = schemaRegistry.kindsByDomain("core");
    expect(coreKinds).toContain("LoadBalancer");
    expect(coreKinds).toContain("Session");
    expect(coreKinds).toContain("Endpoint");
    expect(coreKinds).toContain("EndpointHostState");
  });

  test("kindsByDomain returns correct kinds for security", () => {
    const secKinds = schemaRegistry.kindsByDomain("security");
    expect(secKinds).toContain("Firewall");
    expect(secKinds).toContain("IpFilter");
    expect(secKinds).toContain("SecurityRate");
  });

  test("validate returns valid: true for correct LoadBalancer data", () => {
    const result = schemaRegistry.validate("LoadBalancer", {
      serviceArguments: {
        externalIP: "10.0.0.1",
        port: 80,
        protocol: "tcp",
        name: "test",
      },
      endpoints: [
        {
          endpointIP: "192.168.1.10",
          targetPort: 8080,
          weight: 50,
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("validate returns valid: false for invalid LoadBalancer data", () => {
    const result = schemaRegistry.validate("LoadBalancer", {
      serviceArguments: {
        port: "notanumber", // should be integer
      },
      endpoints: "not-an-array", // should be array
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("validate returns error for unknown kind", () => {
    const result = schemaRegistry.validate("unknownKind", {});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unknown kind: unknownKind");
  });

  test("getEnumMap returns bidirectional map for known field path", () => {
    const map = schemaRegistry.getEnumMap("LoadBalancer.serviceArguments.mode");
    expect(map).toBeDefined();
    expect(map!.toApi.dnat).toBe(0);
    expect(map!.toApi.fullproxy).toBe(4);
    expect(map!.fromApi[0]).toBe("dnat");
    expect(map!.fromApi[6]).toBe("aigw");
  });

  test("getEnumMap returns undefined for unknown field path", () => {
    expect(schemaRegistry.getEnumMap("LoadBalancer.nonexistent")).toBeUndefined();
  });

  test("isOperational returns true for EndpointHostState", () => {
    expect(schemaRegistry.isOperational("EndpointHostState")).toBe(true);
  });

  test("isOperational returns false for LoadBalancer", () => {
    expect(schemaRegistry.isOperational("LoadBalancer")).toBe(false);
  });
});
