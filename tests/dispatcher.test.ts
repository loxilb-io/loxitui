import { describe, expect, it } from "bun:test";
import type { ApiResult, LoxilbApiClient } from "../src/api/client";
import { parseCommand } from "../src/cmd/parser";
import { HELP_TEXT, dispatch } from "../src/tui/commands/dispatcher";

/** Minimal mock of LoxilbApiClient for dispatcher tests. */
function mockApi(responses: Record<string, ApiResult<unknown>>): LoxilbApiClient {
  const handler = (method: string, path: string) => {
    const key = `${method} ${path}`;
    return Promise.resolve(responses[key] ?? { ok: true, data: undefined });
  };
  return {
    get: (path: string) => handler("GET", path),
    post: (path: string, _body?: unknown) => handler("POST", path),
    del: (path: string, _body?: unknown) => handler("DELETE", path),
  } as unknown as LoxilbApiClient;
}

// ── Error handling (AC-E, AC-F) ─────────────────────────────────────────────

describe("Dispatcher: unknown verb / resource", () => {
  const api = mockApi({});

  it("returns ok:false for unknown verb with message containing 'Unknown verb'", async () => {
    const r = await dispatch({ verb: "unknown", resource: "lb", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown verb");
  });

  it("returns ok:false for verb 'fly'", async () => {
    const r = await dispatch({ verb: "fly", resource: "lb", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown verb: fly");
    expect(r.message).toContain("list, create, delete");
  });

  it("returns ok:false for empty verb", async () => {
    const r = await dispatch({ verb: "", resource: "lb", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown verb");
  });

  it("returns ok:false for unknown resource", async () => {
    const r = await dispatch({ verb: "list", resource: "foobar", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown resource: foobar");
    expect(r.message).toContain("lb, endpoint, route");
  });

  it("returns ok:false for empty resource", async () => {
    const r = await dispatch({ verb: "list", resource: "", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown resource");
  });
});

describe("Dispatcher: read-only resource", () => {
  it("create conntrack returns ok:false with 'read-only'", async () => {
    const api = mockApi({});
    const r = await dispatch({ verb: "create", resource: "conntrack", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("read-only");
  });

  it("delete conntrack returns ok:false with 'read-only'", async () => {
    const api = mockApi({});
    const r = await dispatch({ verb: "delete", resource: "conntrack", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("read-only");
  });
});

// ── All 10 resources: list dispatch (AC-D) ──────────────────────────────────

describe("Dispatcher: lb", () => {
  it("list lb calls GET /config/loadbalancer/all and ok:true", async () => {
    const api = mockApi({
      "GET /config/loadbalancer/all": { ok: true, data: { lbAttr: [{ id: 1 }, { id: 2 }] } },
    });
    const r = await dispatch(parseCommand("list lb"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("list lb: 2 services found");
  });

  it("create lb calls POST /config/loadbalancer and ok:true", async () => {
    const api = mockApi({
      "POST /config/loadbalancer": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("create lb 10.0.0.1 --port 80 --proto tcp"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("10.0.0.1:80/tcp created");
  });

  it("delete lb calls DELETE /config/loadbalancer and ok:true", async () => {
    const api = mockApi({
      "DELETE /config/loadbalancer": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("delete lb --vip 10.0.0.1 --port 80 --proto tcp"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("10.0.0.1:80/tcp deleted");
  });

  it("list lb handles API error", async () => {
    const api = mockApi({
      "GET /config/loadbalancer/all": {
        ok: false,
        error: { status: 500, message: "Internal error", url: "" },
      },
    });
    const r = await dispatch(parseCommand("list lb"), api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Internal error");
  });
});

describe("Dispatcher: endpoint", () => {
  it("list endpoint calls GET /config/endpoint/all and ok:true", async () => {
    const api = mockApi({
      "GET /config/endpoint/all": { ok: true, data: { Attr: [{ name: "ep1" }] } },
    });
    const r = await dispatch(parseCommand("list endpoint"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("list endpoint: 1 endpoints found");
  });

  it("create endpoint calls POST /config/endpoint and ok:true", async () => {
    const api = mockApi({
      "POST /config/endpoint": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("create endpoint --ip 10.0.0.5 --port 8080"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("10.0.0.5:8080 created");
  });

  it("delete endpoint calls DELETE /config/endpoint and ok:true", async () => {
    const api = mockApi({
      "DELETE /config/endpoint": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("delete endpoint --ip 10.0.0.5 --port 8080"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("10.0.0.5:8080 deleted");
  });
});

describe("Dispatcher: route", () => {
  it("list route calls GET /config/route/all and ok:true", async () => {
    const api = mockApi({
      "GET /config/route/all": { ok: true, data: { routeAttr: [{ dst: "10.0.0.0/24" }] } },
    });
    const r = await dispatch(parseCommand("list route"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("list route: 1 routes found");
  });

  it("create route calls POST /config/route and ok:true", async () => {
    const api = mockApi({
      "POST /config/route": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("create route 10.0.0.0/24 --gw 192.168.1.1"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("10.0.0.0/24 via 192.168.1.1 created");
  });

  it("delete route calls DELETE /config/route and ok:true", async () => {
    const api = mockApi({
      "DELETE /config/route": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("delete route --dst 10.0.0.0/24"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("route 10.0.0.0/24 deleted");
  });
});

describe("Dispatcher: conntrack", () => {
  it("list conntrack calls GET /config/conntrack/all and ok:true", async () => {
    const api = mockApi({
      "GET /config/conntrack/all": { ok: true, data: { ctAttr: [{}, {}, {}] } },
    });
    const r = await dispatch(parseCommand("list conntrack"), api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("list conntrack: 3 entries found");
  });
});

// ── Stub resources: list, create, delete ────────────────────────────────────

describe("Dispatcher: stub resources (all 6)", () => {
  const stubs = [
    {
      resource: "ipsec",
      listPath: "GET /config/ipsec/tunnels/all",
      basePath: "/config/ipsec/tunnels",
      label: "ipsec tunnel",
    },
    {
      resource: "firewall",
      listPath: "GET /config/firewall/all",
      basePath: "/config/firewall",
      label: "firewall rule",
    },
    { resource: "vlan", listPath: "GET /config/vlan/all", basePath: "/config/vlan", label: "vlan" },
    {
      resource: "mirrortrack",
      listPath: "GET /config/mirror/all",
      basePath: "/config/mirror",
      label: "mirror rule",
    },
    {
      resource: "session",
      listPath: "GET /config/session/all",
      basePath: "/config/session",
      label: "session",
    },
    {
      resource: "bgppeer",
      listPath: "GET /config/bgp/neigh/all",
      basePath: "/config/bgp/neigh",
      label: "bgp neighbor",
    },
  ];

  for (const { resource, listPath, basePath, label } of stubs) {
    it(`list ${resource} calls correct API and ok:true`, async () => {
      const api = mockApi({ [listPath]: { ok: true, data: [1, 2] } });
      const r = await dispatch(parseCommand(`list ${resource}`), api);
      expect(r.ok).toBe(true);
      expect(r.message).toContain(`list ${label}`);
    });

    it(`create ${resource} calls POST ${basePath} and ok:true`, async () => {
      const api = mockApi({ [`POST ${basePath}`]: { ok: true, data: undefined } });
      const r = await dispatch(parseCommand(`create ${resource} --name test`), api);
      expect(r.ok).toBe(true);
      expect(r.message).toContain("created successfully");
    });

    it(`delete ${resource} calls DELETE ${basePath} and ok:true`, async () => {
      const api = mockApi({ [`DELETE ${basePath}`]: { ok: true, data: undefined } });
      const r = await dispatch(parseCommand(`delete ${resource} --id 1`), api);
      expect(r.ok).toBe(true);
      expect(r.message).toContain("deleted successfully");
    });
  }
});

// ── Human-readable messages ─────────────────────────────────────────────────

describe("Dispatcher: message formatting", () => {
  it("list lb empty → '0 services found'", async () => {
    const api = mockApi({
      "GET /config/loadbalancer/all": { ok: true, data: { lbAttr: [] } },
    });
    const r = await dispatch(parseCommand("list lb"), api);
    expect(r.message).toBe("list lb: 0 services found");
  });

  it("create lb message includes VIP:port/proto", async () => {
    const api = mockApi({
      "POST /config/loadbalancer": { ok: true, data: undefined },
    });
    const r = await dispatch(
      parseCommand("create lb --vip 10.0.0.1 --port 443 --proto https"),
      api
    );
    expect(r.message).toBe("create lb: service 10.0.0.1:443/https created");
  });

  it("delete route message includes CIDR", async () => {
    const api = mockApi({
      "DELETE /config/route": { ok: true, data: undefined },
    });
    const r = await dispatch(parseCommand("delete route --dst 172.16.0.0/16"), api);
    expect(r.message).toBe("delete route: route 172.16.0.0/16 deleted");
  });
});

// ── Help command (US-027, AC-A/B/D) ──────────────────────────────────────────

describe("Dispatcher: help command", () => {
  const api = mockApi({});

  it("dispatch({ verb: 'help' }) returns ok:true with full help text", async () => {
    const r = await dispatch({ verb: "help", resource: "", args: [], flags: {} }, api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe(HELP_TEXT);
  });

  it("dispatch({ verb: '?' }) returns ok:true with full help text", async () => {
    const r = await dispatch({ verb: "?", resource: "", args: [], flags: {} }, api);
    expect(r.ok).toBe(true);
    expect(r.message).toBe(HELP_TEXT);
  });

  it("help text starts with '--- loxicmd commands ---'", () => {
    expect(HELP_TEXT).toStartWith("--- loxicmd commands ---");
  });

  it("help text contains all 10 resource names", () => {
    for (const r of [
      "lb",
      "endpoint",
      "route",
      "conntrack",
      "ipsec",
      "firewall",
      "vlan",
      "mirrortrack",
      "session",
      "bgppeer",
    ]) {
      expect(HELP_TEXT).toContain(r);
    }
  });

  it("help text contains example commands", () => {
    expect(HELP_TEXT).toContain(":list lb");
    expect(HELP_TEXT).toContain(":delete route --dst 10.0.0.0/24");
  });
});

// ── Did-you-mean suggestion (US-027, AC-E) ───────────────────────────────────

describe("Dispatcher: unknown resource suggestion", () => {
  const api = mockApi({});

  it("'doctorr' suggests 'route'", async () => {
    const r = await dispatch({ verb: "list", resource: "doctorr", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Unknown resource");
    expect(r.message).toContain("Did you mean: route?");
  });

  it("'lbb' suggests 'lb'", async () => {
    const r = await dispatch({ verb: "list", resource: "lbb", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Did you mean: lb?");
  });

  it("'firewll' suggests 'firewall'", async () => {
    const r = await dispatch({ verb: "list", resource: "firewll", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Did you mean: firewall?");
  });

  it("completely unrelated input has no suggestion", async () => {
    const r = await dispatch({ verb: "list", resource: "xyzxyzxyzxyz", args: [], flags: {} }, api);
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain("Did you mean");
  });
});
