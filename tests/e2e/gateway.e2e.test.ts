/**
 * Live-gateway E2E suite — exercises the real REST API end to end.
 *
 * Opt-in via LOXITUI_E2E_HOST (see helpers.ts). Six layers:
 *   1. Read sweep — every endpoint the TUI polls must answer without error
 *      (the "zero polling errors on all tabs" acceptance criterion).
 *   2. LB CRUD — create/list/status/stats/delete round-trip on spec paths.
 *   3. YAML engine round-trip — adapter create → diff sees it live →
 *      adapter delete, proving identity-fields paths against the real mux.
 *   4. Config lifecycle — export and snapshot documents are served.
 *   5. AI config round-trips — net identity and JWT auth profile
 *      create/list/delete; objectives too when an AI key store is configured.
 *   6. Half-close settings — change one, then restore the values found.
 *
 * Fixtures use TEST-NET-1 (192.0.2.0/24) addresses or E2E_NAME and are
 * deleted in afterAll even when assertions fail; afterAll also restores the
 * half-close settings.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { HalfCloseConfig, LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "@/yaml/adapters/index.js";
import { calculateDiff } from "@/yaml/reconciler/diff.js";
import type { YamlResource } from "@/yaml/types.js";
import {
  E2E_CIDR,
  E2E_EP_IP,
  E2E_NAME,
  E2E_VIP,
  GATEWAY_READY_TIMEOUT_MS,
  e2eEnabled,
  makeApi,
  waitForGateway,
} from "./helpers.js";

const d = e2eEnabled ? describe : describe.skip;

const LB_IDENTITY = { externalIP: E2E_VIP, port: 8080, protocol: "tcp" } as const;

const LB_BODY = {
  serviceArguments: {
    externalIP: E2E_VIP,
    port: 8080,
    protocol: "tcp",
    sel: 0,
    mode: 0,
    bgp: false,
    monitor: false,
  },
  endpoints: [{ endpointIP: E2E_EP_IP, targetPort: 5001, weight: 1 }],
};

d("E2E: live gateway", () => {
  let api: LoxilbApi;
  let halfCloseFound: HalfCloseConfig | undefined;

  // The gateway loads its eBPF/TC data plane before serving the REST API, which
  // on a cold CI container takes tens of seconds. The explicit hook timeout must
  // exceed waitForGateway's poll budget, or Bun's 5s default kills the wait early.
  beforeAll(async () => {
    api = makeApi();
    await waitForGateway(api);
  }, GATEWAY_READY_TIMEOUT_MS + 15_000);

  afterAll(async () => {
    if (!api) return;
    // Sweep fixtures even if a test failed mid-way; ignore errors.
    await api.lb.delete(LB_IDENTITY);
    await api.raw.del(`/config/ipfilter?filterType=whitelist&cidr=${encodeURIComponent(E2E_CIDR)}`);
    await api.aiGateway.deleteNetIdentity(E2E_NAME);
    await api.aiGateway.deleteJWTAuthProfile(E2E_NAME);
    await api.aiGateway.deleteObjective(E2E_NAME);
    if (halfCloseFound) await api.lb.setHalfClose(halfCloseFound);
  });

  // ── 1. Read sweep: every polled endpoint answers ─────────────────────────
  //
  // Two tiers: CORE endpoints must succeed on any gateway. FEATURE_GATED
  // endpoints (BGP mode off, no BFD sessions, tracing disabled, no AI key
  // store, …) may return a structured feature-disabled error — but never 404
  // (wrong path) or 0 (transport failure), which is what actually catches
  // path drift.
  describe("read sweep (zero polling errors)", () => {
    const cases: Array<[string, (a: LoxilbApi) => Promise<{ ok: boolean }>]> = [
      ["lb.list", (a) => a.lb.list()],
      ["lb.getHalfClose", (a) => a.lb.getHalfClose()],
      ["ep.list", (a) => a.ep.list()],
      ["ct.list", (a) => a.ct.list()],
      ["cluster.list", (a) => a.cluster.list()],
      ["route.list", (a) => a.route.list()],
      ["status.processes", (a) => a.status.processes()],
      ["status.filesystem", (a) => a.status.filesystem()],
      ["status.device", (a) => a.status.device()],
      ["status.version", (a) => a.status.version()],
      ["status.ready", (a) => a.status.ready()],
      ["status.capabilities", (a) => a.status.capabilities()],
      ["status.diagnostics", (a) => a.status.diagnostics()],
      ["status.maintenance", (a) => a.status.maintenance()],
      ["trace.list", (a) => a.trace.list()],
      ["ports.list", (a) => a.ports.list()],
      ["security.listFirewall", (a) => a.security.listFirewall()],
      ["security.listIPFilter", (a) => a.security.listIPFilter()],
      ["security.listSecurityRate", (a) => a.security.listSecurityRate()],
      ["security.listSNICertificates", (a) => a.security.listSNICertificates()],
      ["security.listCORS", (a) => a.security.listCORS()],
      ["network.listVlans", (a) => a.network.listVlans()],
      ["network.listVxlans", (a) => a.network.listVxlans()],
      ["network.listSessions", (a) => a.network.listSessions()],
      ["network.listPolicies", (a) => a.network.listPolicies()],
      ["network.listMirrors", (a) => a.network.listMirrors()],
      ["network.listIPv4Addresses", (a) => a.network.listIPv4Addresses()],
      ["network.listNeighbors", (a) => a.network.listNeighbors()],
      ["network.listFdb", (a) => a.network.listFdb()],
      ["ipsec.listTunnels", (a) => a.ipsec.listTunnels()],
      ["ipsec.listSAs", (a) => a.ipsec.listSAs()],
      ["ipsec.getStats", (a) => a.ipsec.getStats()],
      ["ipsec.listCertificates", (a) => a.ipsec.listCertificates()],
      ["aiGateway.getGPUStatus", (a) => a.aiGateway.getGPUStatus()],
      ["aiGateway.listModelProfiles", (a) => a.aiGateway.listModelProfiles()],
      ["aiGateway.listNetIdentities", (a) => a.aiGateway.listNetIdentities()],
      ["aiGateway.listJWTAuthProfiles", (a) => a.aiGateway.listJWTAuthProfiles()],
      ["audit.getStatus", (a) => a.audit.getStatus()],
      ["audit.getPolicy", (a) => a.audit.getPolicy()],
      ["audit.getSink", (a) => a.audit.getSink()],
      // Without a DPU provider both answer the disabled, empty shape.
      ["dpu.getDebug", (a) => a.dpu.getDebug()],
      ["dpu.getHWCounters", (a) => a.dpu.getHWCounters()],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const r = await call(api);
        expect(r.ok).toBe(true);
      });
    }

    // May be disabled on a given deployment; a structured error is fine but a
    // 404 means the TUI's path no longer matches the gateway router.
    const featureGated: Array<
      [string, (a: LoxilbApi) => Promise<{ ok: boolean; error?: { status: number } }>]
    > = [
      ["bgp.listNeighbors", (a) => a.bgp.listNeighbors()],
      ["bgp.listPolicyDefinitions", (a) => a.bgp.listPolicyDefinitions()],
      ["bfd.list", (a) => a.bfd.list()],
      ["aiGateway.listTraceParsers", (a) => a.aiGateway.listTraceParsers()],
      ["aiGateway.listTraceCatalogs", (a) => a.aiGateway.listTraceCatalogs()],
      // getRateLimitDefaults is not swept: with no defaults row it answers a
      // resource 404 this tier cannot tell from a wrong path. An unknown
      // tenant's user limits are an empty list instead, so that read stands in.
      ["aiGateway.listObjectives", (a) => a.aiGateway.listObjectives()],
      ["aiGateway.listUserRateLimits", (a) => a.aiGateway.listUserRateLimits(E2E_NAME)],
    ];

    for (const [name, call] of featureGated) {
      test(`${name} (feature-gated: ok or structured error, never 404)`, async () => {
        const r = await call(api);
        if (!r.ok) {
          expect(r.error?.status).not.toBe(404);
          expect(r.error?.status).not.toBe(0);
        }
      });
    }
  });

  // ── 2. LB CRUD round-trip on spec paths ──────────────────────────────────
  describe("LB CRUD round-trip", () => {
    test("create returns success", async () => {
      const r = await api.lb.create(LB_BODY as Parameters<typeof api.lb.create>[0]);
      expect(r.ok).toBe(true);
    });

    test("created rule appears in list", async () => {
      const r = await api.lb.list();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some(
        (lb) => lb.serviceArguments?.externalIP === E2E_VIP && lb.serviceArguments?.port === 8080
      );
      expect(found).toBe(true);
    });

    test("per-rule status endpoint answers", async () => {
      const r = await api.lb.getStatus(LB_IDENTITY);
      expect(r.ok).toBe(true);
    });

    test("per-rule stats endpoint answers", async () => {
      const r = await api.lb.getStats(LB_IDENTITY);
      expect(r.ok).toBe(true);
    });

    test("delete removes the rule", async () => {
      const del = await api.lb.delete(LB_IDENTITY);
      expect(del.ok).toBe(true);
      const r = await api.lb.list();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some((lb) => lb.serviceArguments?.externalIP === E2E_VIP);
      expect(found).toBe(false);
    });
  });

  // ── 3. YAML engine round-trip (identity-fields against the real mux) ─────
  describe("YAML adapter round-trip (IpFilter: query-param delete)", () => {
    const resource: YamlResource = {
      apiVersion: "loxilb.io/v1",
      kind: "IpFilter",
      metadata: { name: "e2e-ipfilter" },
      spec: { filterType: "whitelist", cidr: E2E_CIDR, action: "allow" },
    };

    test("diff reports CREATE for a new resource", async () => {
      const diffs = await calculateDiff([resource], api);
      const mine = diffs.find((r) => r.identityKey.includes(E2E_CIDR));
      expect(mine?.operation).toBe("CREATE");
    });

    test("adapter create is accepted by the gateway", async () => {
      const adapter = adapterRegistry.get("IpFilter");
      if (!adapter) throw new Error("IpFilter adapter not registered");
      const r = await adapter.create(api, resource);
      expect(r.ok).toBe(true);
    });

    test("diff now sees it live (no longer CREATE)", async () => {
      const diffs = await calculateDiff([resource], api);
      const mine = diffs.find((r) => r.identityKey.includes(E2E_CIDR));
      expect(mine).toBeDefined();
      expect(mine?.operation).not.toBe("CREATE");
    });

    test("adapter delete (query-param path) is accepted", async () => {
      const adapter = adapterRegistry.get("IpFilter");
      if (!adapter) throw new Error("IpFilter adapter not registered");
      const r = await adapter.delete(api, resource);
      expect(r.ok).toBe(true);
      const list = await api.security.listIPFilter();
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      const found = (list.data as Array<{ cidr?: string }>).some((f) => f.cidr === E2E_CIDR);
      expect(found).toBe(false);
    });
  });

  // ── 4. Config lifecycle documents ────────────────────────────────────────
  describe("config lifecycle", () => {
    test("GET /config/export returns a JSON document", async () => {
      const r = await api.lifecycle.exportConfig(["loadbalancer"]);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(() => JSON.parse(r.text)).not.toThrow();
    });

    test("GET /config/snapshot returns a checksummed document", async () => {
      const r = await api.lifecycle.snapshot();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(() => JSON.parse(r.text)).not.toThrow();
    });
  });

  // ── 5. AI config round-trips (net identity, JWT profile, objective) ──────
  //
  // Net identities and JWT auth profiles are held by the gateway itself, so
  // these run on any gateway. Objectives are AI key store rows: without a
  // store the create is refused with ai_key_store_unconfigured and the later
  // steps have nothing to check.
  describe("net identity round-trip", () => {
    test("create returns success", async () => {
      const r = await api.aiGateway.setNetIdentity({
        name: E2E_NAME,
        match: { cidr: [E2E_CIDR] },
        tenant: E2E_NAME,
      });
      expect(r.ok).toBe(true);
    });

    test("created binding appears in list", async () => {
      const r = await api.aiGateway.listNetIdentities();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some((n) => n.name === E2E_NAME);
      expect(found).toBe(true);
    });

    test("delete removes the binding", async () => {
      const del = await api.aiGateway.deleteNetIdentity(E2E_NAME);
      expect(del.ok).toBe(true);
      const r = await api.aiGateway.listNetIdentities();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some((n) => n.name === E2E_NAME);
      expect(found).toBe(false);
    });
  });

  describe("JWT auth profile round-trip", () => {
    test("create returns success", async () => {
      const r = await api.aiGateway.setJWTAuthProfile({
        name: E2E_NAME,
        issuer: "https://issuer.invalid", // RFC 2606, never resolves
      });
      expect(r.ok).toBe(true);
    });

    test("created profile appears in list", async () => {
      const r = await api.aiGateway.listJWTAuthProfiles();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some((p) => p.name === E2E_NAME);
      expect(found).toBe(true);
    });

    test("delete removes the profile", async () => {
      const del = await api.aiGateway.deleteJWTAuthProfile(E2E_NAME);
      expect(del.ok).toBe(true);
      const r = await api.aiGateway.listJWTAuthProfiles();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = r.data.some((p) => p.name === E2E_NAME);
      expect(found).toBe(false);
    });
  });

  describe("AI objective round-trip (feature-gated: AI key store)", () => {
    let stored = false;

    test("create returns success, or ai_key_store_unconfigured without a store", async () => {
      const r = await api.aiGateway.setObjective({ name: E2E_NAME });
      stored = r.ok;
      if (!r.ok) expect(r.error.message).toBe("ai_key_store_unconfigured");
    });

    test("created objective appears in list", async () => {
      if (!stored) return;
      const r = await api.aiGateway.listObjectives();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = (r.data.objectiveAttr ?? []).some((o) => o.name === E2E_NAME);
      expect(found).toBe(true);
    });

    test("delete removes the objective", async () => {
      if (!stored) return;
      const del = await api.aiGateway.deleteObjective(E2E_NAME);
      expect(del.ok).toBe(true);
      const r = await api.aiGateway.listObjectives();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = (r.data.objectiveAttr ?? []).some((o) => o.name === E2E_NAME);
      expect(found).toBe(false);
    });
  });

  // ── 6. Half-close settings: change one, then restore ─────────────────────
  //
  // Process-wide, so only capSeconds is changed (allow and defaultMode decide
  // which services hold), and afterAll posts the values found back even if
  // the restore step never runs.
  describe("half-close settings round-trip", () => {
    test("set changes capSeconds and keeps the other fields", async () => {
      const before = await api.lb.getHalfClose();
      expect(before.ok).toBe(true);
      if (!before.ok) return;
      halfCloseFound = before.data;
      const capSeconds = before.data.capSeconds === 60 ? 61 : 60;
      const r = await api.lb.setHalfClose({ capSeconds });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toEqual({ ...before.data, capSeconds });
    });

    test("restore brings back the values found", async () => {
      expect(halfCloseFound).toBeDefined();
      if (!halfCloseFound) return;
      const r = await api.lb.setHalfClose(halfCloseFound);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toEqual(halfCloseFound);
    });
  });
});
