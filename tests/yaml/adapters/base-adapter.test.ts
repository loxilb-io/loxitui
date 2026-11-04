import { describe, expect, test } from "bun:test";
import { AdapterRegistry, adapterRegistry } from "../../../src/yaml/adapters/adapter-registry.js";
import { BaseResourceAdapter } from "../../../src/yaml/adapters/base-adapter.js";
import type { NormalizedResource, ResourceAdapter } from "../../../src/yaml/adapters/types.js";

// ─── Test adapter using a real registered kind (LoadBalancer) ───────────

class TestLoadBalancerAdapter extends BaseResourceAdapter {
  constructor() {
    super("LoadBalancer");
  }

  protected computedFields(): string[] {
    return ["serviceArguments.lbAddedCount", "serviceArguments.state"];
  }
}

// ─── Test adapter for flat kind (Session) ───────────────────────────────

class TestSessionAdapter extends BaseResourceAdapter {
  constructor() {
    super("Session");
  }

  protected computedFields(): string[] {
    return [];
  }
}

// ─── Test adapter for singleton kind (SecurityRate, identityFields=[]) ──

class TestSecurityRateAdapter extends BaseResourceAdapter {
  constructor() {
    super("SecurityRate");
  }

  protected computedFields(): string[] {
    return [];
  }
}

// ─── Test adapter for multi-identity kind (IPv4Address) ─────────────────

class TestIPv4AddressAdapter extends BaseResourceAdapter {
  constructor() {
    super("IPv4Address");
  }

  protected computedFields(): string[] {
    return [];
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("BaseResourceAdapter", () => {
  describe("constructor", () => {
    test("resolves metadata from schemaRegistry for known kind", () => {
      const adapter = new TestLoadBalancerAdapter();
      expect(adapter.kind).toBe("LoadBalancer");
      expect(adapter.metadata.apiEndpoint).toBe("/config/loadbalancer");
      expect(adapter.metadata.identityFields).toEqual(["externalIP", "port", "protocol"]);
      expect(adapter.metadata.domainGroup).toBe("core");
      expect(adapter.metadata.hasNestedWrapper).toBe(true);
      expect(adapter.metadata.wrapperField).toBe("serviceArguments");
    });

    test("throws for unknown kind", () => {
      class BadAdapter extends BaseResourceAdapter {
        constructor() {
          super("NonExistentKind");
        }
        protected computedFields() {
          return [];
        }
      }
      expect(() => new BadAdapter()).toThrow("Unknown kind: NonExistentKind");
    });
  });

  describe("extractIdentityKey", () => {
    test("extracts identity from wrapper fields (LoadBalancer)", () => {
      const adapter = new TestLoadBalancerAdapter();
      const spec = {
        serviceArguments: {
          externalIP: "10.0.0.1",
          port: 80,
          protocol: "tcp",
        },
      };
      expect(adapter.extractIdentityKey(spec)).toBe("10.0.0.1/80/tcp");
    });

    test("extracts identity from flat fields (Session)", () => {
      const adapter = new TestSessionAdapter();
      const spec = { ident: "my-session" };
      expect(adapter.extractIdentityKey(spec)).toBe("my-session");
    });

    test("returns kind name for singletons (SecurityRate)", () => {
      const adapter = new TestSecurityRateAdapter();
      const spec = { enabled: true };
      expect(adapter.extractIdentityKey(spec)).toBe("SecurityRate");
    });

    test("joins multiple identity fields with / (IPv4Address)", () => {
      const adapter = new TestIPv4AddressAdapter();
      const spec = { ipAddress: "192.168.1.1/24", dev: "eth0" };
      expect(adapter.extractIdentityKey(spec)).toBe("192.168.1.1/24/eth0");
    });
  });

  describe("normalizeGetResponse", () => {
    test("strips computed fields from response", () => {
      const adapter = new TestLoadBalancerAdapter();
      const apiItem = {
        serviceArguments: {
          externalIP: "10.0.0.1",
          port: 80,
          protocol: "tcp",
          mode: 0,
          sel: 1,
          lbAddedCount: 5,
          state: "active",
        },
      };
      const result = adapter.normalizeGetResponse(apiItem);
      const svcArgs = result.serviceArguments as Record<string, unknown>;
      expect(svcArgs.lbAddedCount).toBeUndefined();
      expect(svcArgs.state).toBeUndefined();
      // Original should be untouched
      const origArgs = apiItem.serviceArguments;
      expect(origArgs.lbAddedCount).toBe(5);
      expect(origArgs.state).toBe("active");
    });

    test("converts integer enums to strings", () => {
      const adapter = new TestLoadBalancerAdapter();
      const apiItem = {
        serviceArguments: {
          externalIP: "10.0.0.1",
          port: 80,
          protocol: "tcp",
          mode: 0,
          sel: 2,
          security: 1,
        },
      };
      const result = adapter.normalizeGetResponse(apiItem);
      const svcArgs = result.serviceArguments as Record<string, unknown>;
      expect(svcArgs.mode).toBe("dnat");
      expect(svcArgs.sel).toBe("wrr");
      expect(svcArgs.security).toBe("https");
    });

    test("does not mutate original object", () => {
      const adapter = new TestLoadBalancerAdapter();
      const original = {
        serviceArguments: { mode: 0, externalIP: "1.2.3.4", port: 80, protocol: "tcp" },
      };
      adapter.normalizeGetResponse(original);
      expect(original.serviceArguments.mode).toBe(0); // still integer
    });
  });

  describe("toApiBody", () => {
    test("converts string enums to integers", () => {
      const adapter = new TestLoadBalancerAdapter();
      const spec = {
        serviceArguments: {
          externalIP: "10.0.0.1",
          port: 80,
          protocol: "tcp",
          mode: "dnat",
          sel: "hash",
        },
      };
      const body = adapter.toApiBody(spec);
      const svcArgs = body.serviceArguments as Record<string, unknown>;
      expect(svcArgs.mode).toBe(0);
      expect(svcArgs.sel).toBe(1);
    });

    test("does not mutate original spec", () => {
      const adapter = new TestLoadBalancerAdapter();
      const spec = {
        serviceArguments: { mode: "dnat", externalIP: "1.2.3.4", port: 80, protocol: "tcp" },
      };
      adapter.toApiBody(spec);
      expect(spec.serviceArguments.mode).toBe("dnat"); // still string
    });

    test("passes through non-enum fields unchanged", () => {
      const adapter = new TestSessionAdapter();
      const spec = { ident: "my-session", timeout: 300 };
      const body = adapter.toApiBody(spec);
      expect(body.ident).toBe("my-session");
      expect(body.timeout).toBe(300);
    });
  });

  describe("extractItems", () => {
    test("returns array if response is array", () => {
      const adapter = new TestSessionAdapter();
      const data = [{ ident: "a" }, { ident: "b" }] as unknown as Record<string, unknown>;
      // Access protected method via type assertion
      const items = (adapter as any).extractItems(data);
      expect(items).toEqual([{ ident: "a" }, { ident: "b" }]);
    });

    test("extracts array from object with single array key", () => {
      const adapter = new TestSessionAdapter();
      const data = { sessionAttr: [{ ident: "x" }, { ident: "y" }] };
      const items = (adapter as any).extractItems(data);
      expect(items).toEqual([{ ident: "x" }, { ident: "y" }]);
    });

    test("wraps singleton response as array", () => {
      const adapter = new TestSecurityRateAdapter();
      const data = { enabled: true, threshold: 100 };
      const items = (adapter as any).extractItems(data);
      expect(items).toEqual([{ enabled: true, threshold: 100 }]);
    });
  });

  describe("buildDeletePath", () => {
    test("substitutes identity fields in delete path (flat)", () => {
      const adapter = new TestSessionAdapter();
      const spec = { ident: "my-session" };
      const path = (adapter as any).buildDeletePath(spec);
      expect(path).toBe("/config/session/ident/my-session");
    });

    test("substitutes identity fields from wrapper (LoadBalancer)", () => {
      const adapter = new TestLoadBalancerAdapter();
      const spec = {
        serviceArguments: {
          externalIP: "10.0.0.1",
          port: 80,
          protocol: "tcp",
        },
      };
      const path = (adapter as any).buildDeletePath(spec);
      expect(path).toBe("/config/loadbalancer/externalipaddress/10.0.0.1/port/80/protocol/tcp");
    });

    test("URL-encodes special characters", () => {
      const adapter = new TestIPv4AddressAdapter();
      const spec = { ipAddress: "10.0.0.1", mask: "24", dev: "eth0/1" };
      const path = (adapter as any).buildDeletePath(spec);
      expect(path).toContain("eth0%2F1");
    });
  });
});

describe("AdapterRegistry", () => {
  test("register and get returns adapter", () => {
    const registry = new AdapterRegistry();
    const adapter = new TestSessionAdapter();
    registry.register(adapter);
    expect(registry.get("Session")).toBe(adapter);
  });

  test("get returns undefined for unregistered kind", () => {
    const registry = new AdapterRegistry();
    expect(registry.get("Unknown")).toBeUndefined();
  });

  test("allKinds returns registered kind strings", () => {
    const registry = new AdapterRegistry();
    registry.register(new TestSessionAdapter());
    registry.register(new TestSecurityRateAdapter());
    const kinds = registry.allKinds();
    expect(kinds).toContain("Session");
    expect(kinds).toContain("SecurityRate");
    expect(kinds.length).toBe(2);
  });

  test("singleton adapterRegistry is an instance of AdapterRegistry", () => {
    expect(adapterRegistry).toBeInstanceOf(AdapterRegistry);
  });
});
