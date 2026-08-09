import { describe, expect, test } from "bun:test";
import { adapterRegistry } from "../../../src/yaml/adapters/adapter-registry.js";
import { FirewallAdapter } from "../../../src/yaml/adapters/security/firewall.js";
import { IpFilterAdapter } from "../../../src/yaml/adapters/security/ip-filter.js";
import { SecurityRateAdapter } from "../../../src/yaml/adapters/security/security-rate.js";

describe("FirewallAdapter", () => {
  const adapter = new FirewallAdapter();

  test("kind and metadata", () => {
    expect(adapter.kind).toBe("Firewall");
    expect(adapter.metadata.hasNestedWrapper).toBe(true);
    expect(adapter.metadata.wrapperField).toBe("ruleArguments");
  });

  test("extractIdentityKey from wrapper", () => {
    const spec = {
      ruleArguments: { preference: 100 },
      opts: { allow: true },
    };
    expect(adapter.extractIdentityKey(spec)).toBe("100");
  });

  test("normalizeGetResponse strips opts.counter", () => {
    const apiItem = {
      ruleArguments: { preference: 100, sourceIP: "10.0.0.0/8" },
      opts: { allow: true, counter: 42 },
    };
    const result = adapter.normalizeGetResponse(apiItem);
    const opts = result.opts as Record<string, unknown>;
    expect(opts.allow).toBe(true);
    expect(opts.counter).toBeUndefined();
  });

  test("round-trip: toApiBody -> add counter -> normalize", () => {
    const spec = {
      ruleArguments: { preference: 200, sourceIP: "192.168.0.0/16" },
      opts: { allow: false },
    };
    const body = adapter.toApiBody(spec);
    // Simulate GET with counter added
    const getResp = structuredClone(body);
    (getResp.opts as Record<string, unknown>).counter = 99;
    const normalized = adapter.normalizeGetResponse(getResp);
    expect((normalized.opts as Record<string, unknown>).counter).toBeUndefined();
    expect((normalized.opts as Record<string, unknown>).allow).toBe(false);
    expect((normalized.ruleArguments as Record<string, unknown>).preference).toBe(200);
  });
});

describe("IpFilterAdapter", () => {
  const adapter = new IpFilterAdapter();

  test("kind and metadata", () => {
    expect(adapter.kind).toBe("IpFilter");
    expect(adapter.metadata.identityFields).toEqual(["filterType", "cidr"]);
  });

  test("extractIdentityKey", () => {
    expect(adapter.extractIdentityKey({ filterType: "whitelist", cidr: "10.0.0.0/8" })).toBe(
      "whitelist/10.0.0.0/8"
    );
  });

  test("round-trip with flat spec", () => {
    const spec = { filterType: "blacklist", cidr: "192.168.1.0/24" };
    const body = adapter.toApiBody(spec);
    const normalized = adapter.normalizeGetResponse(body);
    expect(normalized.filterType).toBe("blacklist");
    expect(normalized.cidr).toBe("192.168.1.0/24");
  });
});

describe("SecurityRateAdapter", () => {
  const adapter = new SecurityRateAdapter();

  test("kind and singleton identity", () => {
    expect(adapter.kind).toBe("SecurityRate");
    expect(adapter.extractIdentityKey({ rate: 1000 })).toBe("SecurityRate");
  });

  test("normalizeGetResponse strips stats", () => {
    const apiItem = {
      rate: 1000,
      stats: { activeBlocks: 5, totalBlocked: 100 },
    };
    const result = adapter.normalizeGetResponse(apiItem);
    expect(result.rate).toBe(1000);
    expect(result.stats).toBeUndefined();
  });
});

describe("Security adapter registration", () => {
  test("all 3 security adapters are registered", () => {
    expect(adapterRegistry.get("Firewall")).toBeDefined();
    expect(adapterRegistry.get("IpFilter")).toBeDefined();
    expect(adapterRegistry.get("SecurityRate")).toBeDefined();
  });
});
