import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { LoxilbApi } from "../src/api";
import { AuditLogger } from "../src/audit/logger";

const BASE = "http://h:11111/netlox/v1";
const SVC = { externalIP: "10.0.0.1", port: 8080, protocol: "tcp" as const };

let calls: { method: string; url: string; body?: unknown }[];
let respond: () => Response;
const origFetch = global.fetch;

beforeEach(() => {
  calls = [];
  respond = () => new Response(JSON.stringify({}), { status: 200 });
  global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return respond();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = origFetch;
});

const api = () => new LoxilbApi({ host: "h", port: 11111, tls: false, token: "" });

// Each new gateway operation must reach the method and path the spec declares.
const CASES: [string, (a: LoxilbApi) => Promise<unknown>, string, string][] = [
  [
    "patchAPIKey",
    (a) => a.aiGateway.patchAPIKey("k 1", { enabled: false }),
    "PATCH",
    "/config/ai/apikey/k%201",
  ],
  [
    "getKVInventory",
    (a) => a.aiGateway.getKVInventory(3, 1),
    "GET",
    "/config/ai/kv/inventory?service_id=3&ep_idx=1",
  ],
  ["listModelProfiles", (a) => a.aiGateway.listModelProfiles(), "GET", "/config/ai/model-profiles"],
  [
    "getModelProfile",
    (a) => a.aiGateway.getModelProfile("p1"),
    "GET",
    "/config/ai/model-profiles/p1",
  ],
  ["listObjectives", (a) => a.aiGateway.listObjectives(), "GET", "/config/ai/objective"],
  [
    "setObjective",
    (a) => a.aiGateway.setObjective({ name: "o", priority: 1 }),
    "POST",
    "/config/ai/objective",
  ],
  ["deleteObjective", (a) => a.aiGateway.deleteObjective("o"), "DELETE", "/config/ai/objective/o"],
  ["listNetIdentities", (a) => a.aiGateway.listNetIdentities(), "GET", "/config/ai/netidentity"],
  [
    "setNetIdentity",
    (a) => a.aiGateway.setNetIdentity({ name: "n", match: {}, tenant: "t" }),
    "POST",
    "/config/ai/netidentity",
  ],
  [
    "deleteNetIdentity",
    (a) => a.aiGateway.deleteNetIdentity("n"),
    "DELETE",
    "/config/ai/netidentity/n",
  ],
  [
    "listJWTAuthProfiles",
    (a) => a.aiGateway.listJWTAuthProfiles(),
    "GET",
    "/config/ai/jwtauthprofile",
  ],
  [
    "setJWTAuthProfile",
    (a) => a.aiGateway.setJWTAuthProfile({ name: "j", issuer: "https://idp" }),
    "POST",
    "/config/ai/jwtauthprofile",
  ],
  [
    "deleteJWTAuthProfile",
    (a) => a.aiGateway.deleteJWTAuthProfile("j"),
    "DELETE",
    "/config/ai/jwtauthprofile/j",
  ],
  [
    "setRateLimitDefaults",
    (a) => a.aiGateway.setRateLimitDefaults({ scope: "global" }),
    "POST",
    "/config/ai/ratelimit/defaults",
  ],
  [
    "getRateLimitDefaults global",
    (a) => a.aiGateway.getRateLimitDefaults("global", "ignored"),
    "GET",
    "/config/ai/ratelimit/defaults/global",
  ],
  [
    "getRateLimitDefaults rule",
    (a) => a.aiGateway.getRateLimitDefaults("rule", "svc-a"),
    "GET",
    "/config/ai/ratelimit/defaults/rule?rule_ident=svc-a",
  ],
  [
    "deleteRateLimitDefaults",
    (a) => a.aiGateway.deleteRateLimitDefaults("rule", "svc-a"),
    "DELETE",
    "/config/ai/ratelimit/defaults/rule?rule_ident=svc-a",
  ],
  [
    "setUserRateLimit",
    (a) => a.aiGateway.setUserRateLimit({ tenant_id: "t", user_id: "u" }),
    "POST",
    "/config/ai/user/ratelimit",
  ],
  [
    "listUserRateLimits",
    (a) => a.aiGateway.listUserRateLimits("t"),
    "GET",
    "/config/ai/user/ratelimit/t",
  ],
  [
    "getUserRateLimit",
    (a) => a.aiGateway.getUserRateLimit("t", "u"),
    "GET",
    "/config/ai/user/ratelimit/t/u",
  ],
  [
    "deleteUserRateLimit",
    (a) => a.aiGateway.deleteUserRateLimit("t", "u"),
    "DELETE",
    "/config/ai/user/ratelimit/t/u",
  ],
  ["ready", (a) => a.status.ready(), "GET", "/status/ready"],
  ["capabilities", (a) => a.status.capabilities("m"), "GET", "/status/capabilities?model_name=m"],
  ["diagnostics", (a) => a.status.diagnostics(), "GET", "/diagnostics"],
  ["maintenance", (a) => a.status.maintenance(), "GET", "/maintenance"],
  ["setMaintenance", (a) => a.status.setMaintenance({ enabled: true }), "PUT", "/maintenance"],
  ["audit.getStatus", (a) => a.audit.getStatus(), "GET", "/audit/status"],
  ["audit.getPolicy", (a) => a.audit.getPolicy(), "GET", "/audit/policy"],
  ["audit.setPolicy", (a) => a.audit.setPolicy({}), "POST", "/audit/policy"],
  ["audit.getSink", (a) => a.audit.getSink(), "GET", "/audit/sink"],
  ["audit.setSink", (a) => a.audit.setSink({}), "POST", "/audit/sink"],
  ["audit.getNamedSink", (a) => a.audit.getNamedSink("s"), "GET", "/audit/sinks/s"],
  ["audit.setNamedSink", (a) => a.audit.setNamedSink("s", {}), "PUT", "/audit/sinks/s"],
  ["audit.deleteNamedSink", (a) => a.audit.deleteNamedSink("s"), "DELETE", "/audit/sinks/s"],
  ["audit.rotate", (a) => a.audit.rotate(), "POST", "/audit/rotate"],
  [
    "getKVExactStatus",
    (a) => a.lb.getKVExactStatus(SVC, "m"),
    "GET",
    "/config/loadbalancer/externalipaddress/10.0.0.1/port/8080/protocol/tcp/kvexactstatus?model_name=m",
  ],
  [
    "resetSockMap",
    (a) => a.lb.resetSockMap(SVC),
    "POST",
    "/config/loadbalancer/externalipaddress/10.0.0.1/port/8080/protocol/tcp/sockmapreset",
  ],
  [
    "lb.delete",
    (a) => a.lb.delete(SVC),
    "DELETE",
    "/config/loadbalancer/externalipaddress/10.0.0.1/port/8080/protocol/tcp",
  ],
  [
    "lb.delete (model rule)",
    (a) => a.lb.delete({ ...SVC, model_name: "org/m 1" }),
    "DELETE",
    "/config/loadbalancer/externalipaddress/10.0.0.1/port/8080/protocol/tcp?model_name=org%2Fm%201",
  ],
  ["getHalfClose", (a) => a.lb.getHalfClose(), "GET", "/config/halfclose"],
  ["setHalfClose", (a) => a.lb.setHalfClose({ allow: false }), "POST", "/config/halfclose"],
  ["releaseHalfClose", (a) => a.lb.releaseHalfClose(), "POST", "/config/halfclose/release"],
  [
    "dpu.getDebug",
    (a) => a.dpu.getDebug({ pipe: "p", limit: 5 }),
    "GET",
    "/config/dpu/debug?pipe=p&limit=5",
  ],
  [
    "dpu.runDebugAction",
    (a) => a.dpu.runDebugAction({ action: "cb_force", mode: "open" }),
    "POST",
    "/config/dpu/debug",
  ],
  ["dpu.getHWCounters", (a) => a.dpu.getHWCounters(), "GET", "/config/dpu/hwcounters"],
];

describe("gateway API additions", () => {
  for (const [name, call, method, path] of CASES) {
    it(`${name} → ${method} ${path}`, async () => {
      await call(api());
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe(method);
      expect(calls[0].url).toBe(`${BASE}${path}`);
    });
  }

  it("sends the request body as given", async () => {
    await api().status.setMaintenance({ enabled: true, drain_timeout_seconds: 30 });
    expect(calls[0].body).toEqual({ enabled: true, drain_timeout_seconds: 30 });
  });

  it("unwraps list envelopes", async () => {
    respond = () =>
      new Response(JSON.stringify({ netIdentityAttr: [{ name: "n1" }] }), { status: 200 });
    const result = await api().aiGateway.listNetIdentities();
    expect(result.ok && result.data.map((n) => n.name)).toEqual(["n1"]);
  });

  it("treats a missing list envelope as empty", async () => {
    const result = await api().lb.getKVExactStatus(SVC);
    expect(result.ok && result.data).toEqual([]);
  });

  it("keeps KV inventory hashes exact past 2^53", async () => {
    respond = () =>
      new Response(
        '{"service_id":3,"ep_idx":1,"blocks":[{"block_idx":0,"hash_uint64":18446744073709551557}],"total":1}',
        { status: 200 }
      );
    const result = await api().aiGateway.getKVInventory(3, 1);
    expect(result.ok && result.data.blocks).toEqual([
      { block_idx: 0, hash_uint64: "18446744073709551557" },
    ]);
  });

  it("audits KV inventory reads like any other request", async () => {
    const log = spyOn(AuditLogger.prototype, "log");
    await api().aiGateway.getKVInventory(3, 1);
    expect(log.mock.calls.map(([e]) => e.event)).toEqual(["api.request"]);
    log.mockRestore();
  });

  it("accepts 204 No Content for write operations", async () => {
    respond = () => new Response(null, { status: 204 });
    const result = await api().audit.setPolicy({});
    expect(result.ok).toBe(true);
  });

  it("reads a 503 from /status/ready as not ready, keeping the reasons", async () => {
    respond = () =>
      new Response(JSON.stringify({ ready: false, reasons: ["boot replay pending"] }), {
        status: 503,
      });
    const result = await api().status.ready();
    expect(result.ok && result.data).toEqual({ ready: false, reasons: ["boot replay pending"] });
  });

  it("reports a credential-store 503 from /status/ready as an error", async () => {
    respond = () =>
      new Response(JSON.stringify({ code: 503, message: "credential store unavailable" }), {
        status: 503,
      });
    const result = await api().status.ready();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe("credential store unavailable");
  });

  it("still reports other 503s from the status family as errors", async () => {
    respond = () => new Response(JSON.stringify({ message: "store unavailable" }), { status: 503 });
    const result = await api().status.diagnostics();
    expect(result.ok).toBe(false);
  });
});
