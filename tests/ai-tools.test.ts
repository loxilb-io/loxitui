import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { REGISTERED_TOOLS, executeTool } from "../src/ai/tools";
import { LoxilbApi } from "../src/api";

const BASE = "http://h:11111/netlox/v1";
const KV_EXACT =
  "/config/loadbalancer/externalipaddress/10.0.0.1/port/8080/protocol/tcp/kvexactstatus";

let paths: string[];
let methods: string[];
let respond: (path: string) => Response;
const origFetch = global.fetch;

beforeEach(() => {
  paths = [];
  methods = [];
  respond = () => new Response(JSON.stringify({}), { status: 200 });
  global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(BASE, "");
    paths.push(path);
    methods.push(init?.method ?? "GET");
    return respond(path);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = origFetch;
});

const run = (name: string, args: Record<string, unknown> = {}) =>
  executeTool(name, args, new LoxilbApi({ host: "h", port: 11111, tls: false, token: "" }));

// [tool, args, required params, paths it reads]
const CASES: [string, Record<string, unknown>, string[], string[]][] = [
  ["get_ai_objectives", {}, [], ["/config/ai/objective"]],
  ["get_ai_identities", {}, [], ["/config/ai/netidentity", "/config/ai/jwtauthprofile"]],
  ["get_ai_model_profiles", {}, [], ["/config/ai/model-profiles"]],
  ["get_ai_rate_limit_defaults", {}, [], ["/config/ai/ratelimit/defaults/global"]],
  ["get_ai_user_rate_limits", { tenant_id: "t1" }, ["tenant_id"], ["/config/ai/user/ratelimit/t1"]],
  [
    "get_kv_inventory",
    { service_id: 3, ep_idx: 1 },
    ["service_id", "ep_idx"],
    ["/config/ai/kv/inventory?service_id=3&ep_idx=1"],
  ],
  ["get_kv_exact_status", { ip: "10.0.0.1", port: 8080 }, ["ip", "port"], [KV_EXACT]],
  ["get_half_close", {}, [], ["/config/halfclose"]],
  ["get_readiness", {}, [], ["/status/ready", "/maintenance", "/status/capabilities"]],
  ["get_diagnostics", {}, [], ["/diagnostics"]],
  ["get_audit_status", {}, [], ["/audit/status", "/audit/policy", "/audit/sink"]],
  ["get_dpu_status", {}, [], ["/config/dpu/debug", "/config/dpu/hwcounters"]],
];

describe("gateway read tools", () => {
  for (const [name, args, required, reads] of CASES) {
    it(`${name} is registered and reads ${reads.join(", ")}`, async () => {
      const tool = REGISTERED_TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required ?? []).toEqual(required);
      for (const key of required) expect(tool?.inputSchema.properties[key]).toBeDefined();

      await run(name, args);
      expect(paths.sort()).toEqual([...reads].sort());
      // The tool registry is read-only by contract (docs/mcp-server.md).
      expect(methods.every((m) => m === "GET")).toBe(true);
    });

    it(`${name} reports a failed read`, async () => {
      respond = () => new Response(JSON.stringify({ message: "boom" }), { status: 500 });
      const out = await run(name, args);
      expect(out).toContain("Error fetching");
      expect(out).toContain("boom");
    });
  }

  it("passes optional params through", async () => {
    await run("get_ai_rate_limit_defaults", { rule_ident: "svc-a" });
    await run("get_ai_user_rate_limits", { tenant_id: "t1", user_id: "u1" });
    await run("get_kv_exact_status", { ip: "10.0.0.1", port: 8080, model_name: "m" });
    await run("get_readiness", { model_name: "m" });
    expect(paths).toContain("/config/ai/ratelimit/defaults/rule?rule_ident=svc-a");
    expect(paths).toContain("/config/ai/user/ratelimit/t1/u1");
    expect(paths).toContain(`${KV_EXACT}?model_name=m`);
    expect(paths).toContain("/status/capabilities?model_name=m");
  });

  const NOT_FOUND: [string, Record<string, unknown>, string][] = [
    ["get_ai_rate_limit_defaults", {}, "No global rate-limit defaults set."],
    ["get_ai_user_rate_limits", { tenant_id: "t1", user_id: "u1" }, "No explicit rate limits"],
    ["get_kv_inventory", { service_id: 3, ep_idx: 1 }, "No KV inventory registered"],
    ["get_kv_exact_status", { ip: "10.0.0.1", port: 8080 }, "No KV-exact rule matches"],
    [
      "get_kv_exact_status",
      { ip: "10.0.0.1", port: 8080, model_name: "m" },
      "No KV-exact rule for model m on 10.0.0.1:8080/tcp.",
    ],
    ["get_dpu_status", {}, "DPU offload is not available on this gateway."],
  ];
  for (const [name, args, answer] of NOT_FOUND) {
    const variant = args.model_name ? " (model filter)" : "";
    it(`${name}${variant} answers 404 as absent, not as an error`, async () => {
      respond = () => new Response(JSON.stringify({ message: "not found" }), { status: 404 });
      expect(await run(name, args)).toContain(answer);
    });
  }

  it("a grouped tool reports a failed section in place and keeps the others", async () => {
    respond = (path) =>
      path === "/audit/policy"
        ? new Response(JSON.stringify({ message: "boom" }), { status: 500 })
        : new Response(JSON.stringify({}), { status: 200 });
    const out = await run("get_audit_status");
    expect(out).toContain("Status:");
    expect(out).toContain("Error fetching audit policy: boom");
    expect(out).toContain("Compliance sink:");
  });

  // The tenant list answers model_limits: null even for users that have them.
  it("get_ai_user_rate_limits leaves model limits to the per-user read", async () => {
    respond = (path) =>
      new Response(
        JSON.stringify(
          path === "/config/ai/user/ratelimit/t1"
            ? [{ tenant_id: "t1", user_id: "u1", rps: 5, model_limits: null }]
            : {
                tenant_id: "t1",
                user_id: "u1",
                model_limits: [{ model: "m", tokens_per_min: 100 }],
              }
        ),
        { status: 200 }
      );
    const list = await run("get_ai_user_rate_limits", { tenant_id: "t1" });
    expect(list).toContain('"rps": 5');
    expect(list).not.toContain("model_limits");
    expect(list).toContain("pass user_id");
    const user = await run("get_ai_user_rate_limits", { tenant_id: "t1", user_id: "u1" });
    expect(user).toContain('"tokens_per_min": 100');
  });

  it("get_readiness lists the reasons, drain read-back and capability verdicts", async () => {
    const bodies: Record<string, unknown> = {
      "/status/ready": { ready: false, reasons: ["boot replay pending"] },
      "/maintenance": {
        state: "maintenance",
        elapsed_seconds: 40,
        drain_timeout_seconds: 30,
        refusing_new_config: true,
        refusing_new_inference: true,
        in_flight_streams: 0,
        in_flight_requests: 2,
        drain_deadline_exceeded: true,
      },
      "/status/capabilities": {
        capabilities: [
          { name: "kv_exact_vllm", ready: false, reason: "seed unset" },
          { name: "lb_allowed_sources", ready: true, limit: 29, in_use: 3 },
        ],
      },
    };
    // Not ready is a 503 whose body is the ReadyStatus itself.
    respond = (path) =>
      new Response(JSON.stringify(bodies[path]), { status: path === "/status/ready" ? 503 : 200 });
    expect(await run("get_readiness")).toBe(
      [
        "Readiness: NOT READY",
        "  - boot replay pending",
        "Maintenance: ON for 40s | drain window: 30s | refusing config: true | refusing inference: true | in-flight streams: 0 | in-flight requests: 2 | drain deadline exceeded",
        "Capabilities:",
        "  kv_exact_vllm: NOT READY — seed unset",
        "  lb_allowed_sources: READY (3/29 in use)",
      ].join("\n")
    );
  });

  it("get_readiness counts an omitted in-flight request count as 0", async () => {
    // The gateway omits in_flight_requests when 0 and drain_timeout_seconds when unset.
    respond = (path) =>
      new Response(
        JSON.stringify(
          path === "/maintenance"
            ? {
                state: "maintenance",
                elapsed_seconds: 5,
                refusing_new_config: true,
                refusing_new_inference: true,
                in_flight_streams: 0,
                drain_deadline_exceeded: false,
              }
            : {}
        ),
        { status: 200 }
      );
    expect(await run("get_readiness")).toContain(
      "Maintenance: ON for 5s | refusing config: true | refusing inference: true | in-flight streams: 0 | in-flight requests: 0\n"
    );
  });
});
