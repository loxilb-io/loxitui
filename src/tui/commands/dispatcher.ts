import { readFile, writeFile } from "node:fs/promises";
import type { LoxilbApiClient } from "@/api/client";
import { ConfigLifecycleApi } from "@/api/lifecycle";
import type { RestoreResult } from "@/api/models";
/**
 * Command dispatcher — maps ParsedCommand to LoxiLB REST API calls.
 * Pure TypeScript, no UI imports. Testable without a terminal.
 */
import { getAuditLogger } from "@/audit";
import type { ParsedCommand } from "@/cmd/parser";

export interface DispatchResult {
  ok: boolean;
  data?: unknown;
  message: string;
}

const SUPPORTED_VERBS = ["list", "create", "delete", "update", "show"];
const SUPPORTED_RESOURCES = [
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
];

const READ_ONLY_RESOURCES = new Set(["conntrack"]);

export const HELP_TEXT = `--- loxicmd commands ---
list|create|delete|update|show <resource> [flags]

Resources:
  lb           Load balancer services (alias: loadbalancer, svc)
  endpoint     Service endpoints (alias: ep)
  route        Static routes
  conntrack    Connection tracking [read-only] (alias: ct)
  ipsec        IPSec tunnels
  firewall     Firewall rules (alias: fw)
  vlan         VLAN interfaces
  mirrortrack  Traffic mirroring (alias: mirror)
  session      Session persistence
  bgppeer      BGP peers (alias: bgp)

Config lifecycle:
  :export [file] [--components a,b]    Export config (GET /config/export)
  :snapshot [file] [--components a,b]  Checksummed snapshot (GET /config/snapshot)
  :restore <file> [--commit]           Restore snapshot (dry-run unless --commit)
  :persist                             Persist running config on the gateway

Examples:
  :list lb
  :create lb 10.0.0.1 80 tcp --endpoints 192.168.1.1:8080
  :delete route --dst 10.0.0.0/24
  :snapshot /tmp/loxilb-snap.json
  :restore /tmp/loxilb-snap.json --commit`;

/** Find the closest matching resource for a typo using Levenshtein distance. */
function suggestResource(input: string): string | null {
  if (!input) return null;
  let best = "";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const r of SUPPORTED_RESOURCES) {
    const d = levenshtein(input.toLowerCase(), r);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  // Only suggest if distance is reasonable (≤ 70% of the longer string length)
  const maxLen = Math.max(input.length, best.length);
  return bestDist <= Math.ceil(maxLen * 0.7) ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Dispatch a parsed command to the appropriate LoxiLB REST API call. */
export async function dispatch(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  const result = await _dispatchImpl(cmd, api);
  // Emit cmd.dispatch for any command that reaches a handler (not help/unknown)
  if (cmd.verb !== "help" && cmd.verb !== "?") {
    getAuditLogger().log({
      event: "cmd.dispatch",
      component: "cmd",
      data: {
        verb: cmd.verb ?? "",
        resource: cmd.resource ?? "",
        args_count: cmd.args.length,
        ok: result.ok,
        message: result.message.slice(0, 200),
      },
    });
  }
  return result;
}

const LIFECYCLE_VERBS = new Set(["export", "snapshot", "restore", "persist"]);

async function _dispatchImpl(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  // Handle help / ? as special commands
  if (cmd.verb === "help" || cmd.verb === "?") {
    return { ok: true, message: HELP_TEXT };
  }

  // Lifecycle commands take a file argument where other commands have a
  // resource (":restore snap.json"), so they are handled before validation.
  if (LIFECYCLE_VERBS.has(cmd.verb)) {
    return handleLifecycle(cmd, api);
  }

  if (!cmd.verb || !SUPPORTED_VERBS.includes(cmd.verb)) {
    return {
      ok: false,
      message: `Unknown verb: ${cmd.verb || "(empty)"}. Supported: ${SUPPORTED_VERBS.join(", ")}`,
    };
  }

  if (!cmd.resource || !SUPPORTED_RESOURCES.includes(cmd.resource)) {
    const suggestion = suggestResource(cmd.resource);
    const hint = suggestion ? ` Did you mean: ${suggestion}?` : "";
    return {
      ok: false,
      message: `Unknown resource: ${cmd.resource || "(empty)"}. Supported: ${SUPPORTED_RESOURCES.join(", ")}${hint}`,
    };
  }

  if (READ_ONLY_RESOURCES.has(cmd.resource) && cmd.verb !== "list") {
    return { ok: false, message: `${cmd.resource} is read-only` };
  }

  const handler = RESOURCE_HANDLERS[cmd.resource];
  if (!handler) {
    return { ok: false, message: `No handler for resource: ${cmd.resource}` };
  }

  return handler(cmd, api);
}

// ---------------------------------------------------------------------------
// Resource handlers
// ---------------------------------------------------------------------------

type ResourceHandler = (cmd: ParsedCommand, api: LoxilbApiClient) => Promise<DispatchResult>;

const RESOURCE_HANDLERS: Record<string, ResourceHandler> = {
  lb: handleLb,
  endpoint: handleEndpoint,
  route: handleRoute,
  conntrack: handleConntrack,
  ipsec: handleGeneric("/config/ipsec/tunnels", "ipsec tunnel"),
  firewall: handleGeneric("/config/firewall", "firewall rule"),
  vlan: handleGeneric("/config/vlan", "vlan"),
  mirrortrack: handleGeneric("/config/mirror", "mirror rule"),
  session: handleGeneric("/config/session", "session"),
  bgppeer: handleGeneric("/config/bgp/neigh", "bgp neighbor"),
};

// ── LB ──────────────────────────────────────────────────────────────────────

async function handleLb(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  switch (cmd.verb) {
    case "list":
    case "show": {
      const result = await api.get<{ lbAttr?: unknown[] }>("/config/loadbalancer/all");
      if (!result.ok) return { ok: false, message: `list lb: ${result.error.message}` };
      const items = result.data.lbAttr ?? [];
      return { ok: true, data: items, message: `list lb: ${items.length} services found` };
    }
    case "create": {
      const vip = cmd.args[0] ?? cmd.flags.vip ?? "";
      const port = Number(cmd.flags.port ?? cmd.args[1] ?? "0");
      const proto = cmd.flags.proto ?? cmd.args[2] ?? "tcp";
      const epList = cmd.flags.endpoints ?? "";
      const endpoints = epList
        ? epList.split(",").map((ep) => {
            const [ip, pStr] = ep.split(":");
            return { endpointIP: ip ?? "", targetPort: Number(pStr ?? port), weight: 1 };
          })
        : [];
      const body = {
        serviceArguments: { externalIP: vip, port, protocol: proto, name: `${vip}:${port}` },
        endpoints,
      };
      const result = await api.post("/config/loadbalancer", body);
      if (!result.ok) return { ok: false, message: `create lb: ${result.error.message}` };
      return { ok: true, message: `create lb: service ${vip}:${port}/${proto} created` };
    }
    case "delete": {
      const vip = cmd.flags.vip ?? cmd.args[0] ?? "";
      const port = Number(cmd.flags.port ?? cmd.args[1] ?? "0");
      const proto = cmd.flags.proto ?? cmd.args[2] ?? "tcp";
      // swagger: DELETE /config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}
      const path = `/config/loadbalancer/externalipaddress/${vip}/port/${port}/protocol/${proto}`;
      const result = await api.del(path);
      if (!result.ok) return { ok: false, message: `delete lb: ${result.error.message}` };
      return { ok: true, message: `delete lb: service ${vip}:${port}/${proto} deleted` };
    }
    default:
      return { ok: false, message: `lb: unsupported verb '${cmd.verb}'` };
  }
}

// ── Endpoint ────────────────────────────────────────────────────────────────

async function handleEndpoint(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  switch (cmd.verb) {
    case "list":
    case "show": {
      const result = await api.get<{ Attr?: unknown[] }>("/config/endpoint/all");
      if (!result.ok) return { ok: false, message: `list endpoint: ${result.error.message}` };
      const items = result.data.Attr ?? [];
      return {
        ok: true,
        data: items,
        message: `list endpoint: ${items.length} endpoints found`,
      };
    }
    case "create": {
      const ip = cmd.flags.ip ?? cmd.args[0] ?? "";
      const port = Number(cmd.flags.port ?? cmd.args[1] ?? "0");
      const body = { epIP: ip, epPort: port };
      const result = await api.post("/config/endpoint", body);
      if (!result.ok) return { ok: false, message: `create endpoint: ${result.error.message}` };
      return { ok: true, message: `create endpoint: ${ip}:${port} created` };
    }
    case "delete": {
      const ip = cmd.flags.ip ?? cmd.args[0] ?? "";
      const port = cmd.flags.port ?? cmd.args[1] ?? "";
      // swagger: DELETE /config/endpoint/epipaddress/{ip_address}
      const result = await api.del(`/config/endpoint/epipaddress/${ip}`);
      if (!result.ok) return { ok: false, message: `delete endpoint: ${result.error.message}` };
      const portSuffix = port ? `:${port}` : "";
      return { ok: true, message: `delete endpoint: ${ip}${portSuffix} deleted` };
    }
    default:
      return { ok: false, message: `endpoint: unsupported verb '${cmd.verb}'` };
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

async function handleRoute(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  switch (cmd.verb) {
    case "list":
    case "show": {
      const result = await api.get<{ routeAttr?: unknown[] }>("/config/route/all");
      if (!result.ok) return { ok: false, message: `list route: ${result.error.message}` };
      const items = result.data.routeAttr ?? [];
      return { ok: true, data: items, message: `list route: ${items.length} routes found` };
    }
    case "create": {
      const dst = cmd.args[0] ?? cmd.flags.dst ?? "";
      const gw = cmd.flags.gw ?? cmd.flags.gateway ?? "";
      // swagger: POST /config/route — bare RouteEntry body
      const body = { destinationIPNet: dst, gateway: gw };
      const result = await api.post("/config/route", body);
      if (!result.ok) return { ok: false, message: `create route: ${result.error.message}` };
      return { ok: true, message: `create route: ${dst} via ${gw} created` };
    }
    case "delete": {
      const dst = cmd.flags.dst ?? cmd.args[0] ?? "";
      // swagger: DELETE /config/route/destinationIPNet/{ip_address}/{mask}
      const [ip, mask] = dst.split("/");
      const result = await api.del(`/config/route/destinationIPNet/${ip}/${mask ?? "32"}`);
      if (!result.ok) return { ok: false, message: `delete route: ${result.error.message}` };
      return { ok: true, message: `delete route: route ${dst} deleted` };
    }
    default:
      return { ok: false, message: `route: unsupported verb '${cmd.verb}'` };
  }
}

// ── Conntrack (read-only) ───────────────────────────────────────────────────

async function handleConntrack(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  const result = await api.get<{ ctAttr?: unknown[] }>("/config/conntrack/all");
  if (!result.ok) return { ok: false, message: `list conntrack: ${result.error.message}` };
  const items = result.data.ctAttr ?? [];
  return { ok: true, data: items, message: `list conntrack: ${items.length} entries found` };
}

// ── Generic handler for stub resources ──────────────────────────────────────

function handleGeneric(basePath: string, label: string): ResourceHandler {
  return async (cmd, api) => {
    switch (cmd.verb) {
      case "list":
      case "show": {
        const result = await api.get<unknown>(`${basePath}/all`);
        if (!result.ok) return { ok: false, message: `list ${label}: ${result.error.message}` };
        const data = result.data;
        const count = Array.isArray(data) ? data.length : 1;
        return { ok: true, data, message: `list ${label}: ${count} entries found` };
      }
      case "create": {
        const body = { ...cmd.flags };
        const result = await api.post(basePath, body);
        if (!result.ok) return { ok: false, message: `create ${label}: ${result.error.message}` };
        return { ok: true, message: `create ${label}: created successfully` };
      }
      case "delete": {
        const body = { ...cmd.flags };
        const result = await api.del(basePath, body);
        if (!result.ok) return { ok: false, message: `delete ${label}: ${result.error.message}` };
        return { ok: true, message: `delete ${label}: deleted successfully` };
      }
      default:
        return { ok: false, message: `${label}: unsupported verb '${cmd.verb}'` };
    }
  };
}

// ── Config lifecycle (:export / :snapshot / :restore / :persist) ────────────

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function summarizeRestore(r: RestoreResult): string {
  const plan = r.plan ?? [];
  const apply = plan.reduce((n, p) => n + (p.to_apply ?? 0), 0);
  const del = plan.reduce((n, p) => n + (p.to_delete ?? 0), 0);
  const domains = plan
    .filter((p) => (p.to_apply ?? 0) > 0 || (p.to_delete ?? 0) > 0)
    .map((p) => `${p.domain}:+${p.to_apply ?? 0}/-${p.to_delete ?? 0}`)
    .join(", ");
  const errs = r.errors?.length ? ` errors: ${r.errors.join("; ")}` : "";
  return `${plan.length} domains, apply ${apply}, delete ${del}${domains ? ` (${domains})` : ""}${errs}`;
}

async function handleLifecycle(cmd: ParsedCommand, api: LoxilbApiClient): Promise<DispatchResult> {
  const lifecycle = new ConfigLifecycleApi(api);
  // Parser puts the first positional token in `resource`, so for these verbs
  // it is a file path, not a resource name.
  const fileArg = cmd.resource || cmd.args[0] || "";
  const components = cmd.flags.components ? cmd.flags.components.split(",") : undefined;

  switch (cmd.verb) {
    case "export": {
      const r = await lifecycle.exportConfig(components);
      if (!r.ok) return { ok: false, message: `export: ${r.error.message}` };
      const file = fileArg || `loxilb-export-${timestampSlug()}.json`;
      await writeFile(file, r.text, "utf-8");
      return { ok: true, message: `export: written to ${file}` };
    }
    case "snapshot": {
      const r = await lifecycle.snapshot(components);
      if (!r.ok) return { ok: false, message: `snapshot: ${r.error.message}` };
      const file = fileArg || `loxilb-snapshot-${timestampSlug()}.json`;
      await writeFile(file, r.text, "utf-8");
      return { ok: true, message: `snapshot: written to ${file}` };
    }
    case "restore": {
      if (!fileArg) return { ok: false, message: "Usage: restore <file> [--commit]" };
      let doc: unknown;
      try {
        doc = JSON.parse(await readFile(fileArg, "utf-8"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `restore: cannot read ${fileArg}: ${msg}` };
      }
      const commit = cmd.flags.commit === "true";
      const r = await lifecycle.restore(doc, commit ? "commit" : "dry-run");
      if (!r.ok) return { ok: false, message: `restore: ${r.error.message}` };
      const summary = summarizeRestore(r.data);
      if (!commit) {
        return {
          ok: true,
          data: r.data,
          message: `restore dry-run: ${summary}. Re-run with --commit to apply.`,
        };
      }
      const ok = r.data.result === "ok";
      return {
        ok,
        data: r.data,
        message: `restore commit: ${r.data.result ?? "unknown"} — ${summary}`,
      };
    }
    case "persist": {
      const r = await lifecycle.persist();
      if (!r.ok) return { ok: false, message: `persist: ${r.error.message}` };
      return {
        ok: true,
        message: `persist: ${r.data.result ?? "ok"} → ${r.data.path ?? "?"} (${r.data.checksum ?? "no checksum"})`,
      };
    }
    default:
      return { ok: false, message: `Unknown lifecycle verb: ${cmd.verb}` };
  }
}
