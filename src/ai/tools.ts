import { getAuditLogger } from "@/audit";
import type { LoxilbApi } from "../api/index";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        default?: unknown;
        maximum?: number;
      }
    >;
    required?: string[];
  };
}

export const REGISTERED_TOOLS: readonly ToolDefinition[] = [
  {
    name: "get_logs",
    description:
      "Fetch recent LoxiLB log lines. Use to check for errors, warnings, or recent activity.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of log lines (default 50, max 200)",
          default: 50,
          maximum: 200,
        },
      },
    },
  },
  {
    name: "get_lb_services",
    description: "List all load balancer service rules with VIPs, backends, and health status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_endpoints",
    description: "List all endpoint health probes with status, delay metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_conntrack",
    description:
      "List active connection tracking entries. Use to debug connectivity or see live flows.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max entries to return (default 100, max 500)",
          default: 100,
          maximum: 500,
        },
      },
    },
  },
  {
    name: "get_routes",
    description: "List all routing table entries with destination, gateway, interface.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_cluster_state",
    description: "Get HA cluster state showing instance roles and VIP assignments.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ports",
    description: "List all network interfaces with MAC, MTU, link state, and statistics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_system_status",
    description:
      "Get device info (hostname, OS, kernel, uptime) and top processes by resource usage.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_version",
    description: "Get LoxiLB version and build information.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bgp_neighbors",
    description: "List BGP neighbor sessions with peer IP, AS number, state, and uptime.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_metrics_summary",
    description: "Get summary metrics: flow count, error count, and processed traffic volume.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_firewall_rules",
    description: "List all firewall/security rules with source, destination, protocol, and action.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_trace_status",
    description: "Get HTTP and L4 trace status (enabled/disabled).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_worker_metrics",
    description:
      "Get GPU metrics for all tracked inference workers (queue depth, KV-cache usage) and whether GPU-aware routing is enabled.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_gateway_status",
    description: "Get AI-gateway status: GPU-aware routing state and statistics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_opa_watcher",
    description:
      "Get OPA L4 policy watcher status: configured OPA server, sync state, active rule count, circuit breaker.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

export const ALL_TOOLS: readonly ToolDefinition[] = [...REGISTERED_TOOLS] as const;

function _formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  api: LoxilbApi
): Promise<string> {
  const audit = getAuditLogger();
  const argsSummary = Object.entries(args)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v ?? "")}`)
    .join(",");
  audit.log({
    event: "ai.tool_call",
    component: "mcp",
    data: { tool_name: name, args_summary: argsSummary },
  });
  const t0 = Date.now();
  try {
    const result = await _executeToolImpl(name, args, api);
    audit.log({
      event: "ai.tool_result",
      component: "mcp",
      ms: Date.now() - t0,
      data: { tool_name: name, status: "ok" },
    });
    return result;
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    audit.log({
      event: "ai.tool_result",
      component: "mcp",
      ms: Date.now() - t0,
      data: { tool_name: name, status: "error", error },
    });
    throw err;
  }
}

async function _executeToolImpl(
  name: string,
  args: Record<string, unknown>,
  api: LoxilbApi
): Promise<string> {
  switch (name) {
    case "get_logs": {
      const count = Math.min(Number(args.count) || 50, 200);
      const r = await api.log.list(count);
      if (!r.ok) return `Error fetching logs: ${r.error.message}`;
      const logs = r.data.logs;
      if (!logs || logs.length === 0) return "No log entries found.";
      return `Showing ${logs.length} log lines:\n\n${logs.join("\n")}`;
    }

    case "get_lb_services": {
      const r = await api.lb.list();
      if (!r.ok) return `Error fetching LB services: ${r.error.message}`;
      if (!r.data || (Array.isArray(r.data) && r.data.length === 0))
        return "No load balancer services configured.";
      return JSON.stringify(r.data, null, 2);
    }

    case "get_endpoints": {
      const r = await api.ep.list();
      if (!r.ok) return `Error fetching endpoints: ${r.error.message}`;
      if (!r.data || (Array.isArray(r.data) && r.data.length === 0))
        return "No endpoints configured.";
      return JSON.stringify(r.data, null, 2);
    }

    case "get_conntrack": {
      const limit = Math.min(Number(args.limit) || 100, 500);
      const r = await api.ct.list();
      if (!r.ok) return `Error fetching conntrack: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No active connections.";
      const entries = r.data.slice(0, limit);
      const lines = entries.map(
        (e) =>
          `${e.sourceIP}:${e.sourcePort} → ${e.destinationIP}:${e.destinationPort} [${e.protocol}] ${e.conntrackState || ""}`
      );
      return `Showing ${entries.length} of ${r.data.length} connections:\n\n${lines.join("\n")}`;
    }

    case "get_routes": {
      const r = await api.route.list();
      if (!r.ok) return `Error fetching routes: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No routes configured.";
      const lines = r.data.map(
        (e) => `${e.destinationIPNet} via ${e.gateway || "direct"} dev ${e.ifname || "?"}`
      );
      return lines.join("\n");
    }

    case "get_cluster_state": {
      const r = await api.cluster.list();
      if (!r.ok) return `Error fetching cluster state: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No cluster state available (standalone mode).";
      const lines = r.data.map(
        (e) => `Instance: ${e.instance} | State: ${e.state} | VIP: ${e.vip || "none"}`
      );
      return lines.join("\n");
    }

    case "get_ports": {
      const r = await api.ports.list();
      if (!r.ok) return `Error fetching ports: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No ports found.";
      const lines = r.data.map((e) => {
        const hw = e.portHardwareInformation;
        return `${e.portName} MAC=${hw?.macAddress || "?"} MTU=${hw?.mtu || "?"} Link=${hw?.link || "?"} State=${hw?.state || "?"}`;
      });
      return lines.join("\n");
    }

    case "get_system_status": {
      const [dR, pR] = await Promise.allSettled([api.status.device(), api.status.processes()]);
      const parts: string[] = [];

      if (dR.status === "fulfilled" && dR.value.ok) {
        const d = dR.value.data;
        parts.push(
          `Host: ${d.hostName || "?"} | OS: ${d.OS || "?"} | Kernel: ${d.kernel || "?"} | Arch: ${d.architecture || "?"} | Uptime: ${d.uptime || "?"}`
        );
      } else {
        parts.push("Device info unavailable.");
      }

      if (pR.status === "fulfilled" && pR.value.ok) {
        const procs = pR.value.data.slice(0, 10);
        if (procs.length > 0) {
          parts.push("\nTop Processes:");
          for (const p of procs) {
            parts.push(`PID ${p.pid} ${p.command} CPU=${p.CPUUsage} MEM=${p.MemoryUsage}`);
          }
        }
      } else {
        parts.push("\nProcess info unavailable.");
      }

      return parts.join("\n");
    }

    case "get_version": {
      const r = await api.status.version();
      if (!r.ok) return `Error fetching version: ${r.error.message}`;
      return `Version: ${r.data.version || "?"} | Build: ${r.data.buildInfo || "N/A"}`;
    }

    case "get_bgp_neighbors": {
      const r = await api.bgp.listNeighbors();
      if (!r.ok) return `Error fetching BGP neighbors: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No BGP neighbors configured.";
      const lines = r.data.map(
        (e) =>
          `Peer: ${e.ipAddress} | AS: ${e.remoteAs} | State: ${e.state} | Uptime: ${e.updowntime || "?"}`
      );
      return lines.join("\n");
    }

    case "get_metrics_summary": {
      const [flowR, errR, trafficR] = await Promise.allSettled([
        api.raw.get<{ count: number }>("/metrics/flowcount"),
        api.raw.get<{ count: number }>("/metrics/errorcount"),
        api.raw.get<{ bytes: number }>("/metrics/processedtraffic"),
      ]);
      const flowCount =
        flowR.status === "fulfilled" && flowR.value.ok ? String(flowR.value.data.count) : "--";
      const errorCount =
        errR.status === "fulfilled" && errR.value.ok ? String(errR.value.data.count) : "--";
      const traffic =
        trafficR.status === "fulfilled" && trafficR.value.ok
          ? _formatBytes(trafficR.value.data.bytes)
          : "--";
      return `Flows: ${flowCount}\nErrors: ${errorCount}\nTraffic: ${traffic}`;
    }

    case "get_firewall_rules": {
      const r = await api.security.listFirewall();
      if (!r.ok) return `Error fetching firewall rules: ${r.error.message}`;
      if (!r.data || r.data.length === 0) return "No firewall rules configured.";
      const lines = r.data.map((fw) => {
        const ra = fw.ruleArguments;
        const opts = fw.opts;
        let action = "UNKNOWN";
        if (opts.allow) action = "ALLOW";
        else if (opts.drop) action = "DROP";
        else if (opts.redirect) action = "REDIRECT";
        else if (opts.trap) action = "TRAP";
        return `${ra.sourceIP || "*"}:${ra.minSourcePort || "*"} → ${ra.destinationIP || "*"}:${ra.minDestinationPort || "*"} [proto:${ra.protocol ?? "*"}] → ${action}`;
      });
      return lines.join("\n");
    }

    case "get_trace_status": {
      const r = await api.trace.list();
      if (!r.ok) return `Error fetching trace status: ${r.error.message}`;
      if (!r.data || (Array.isArray(r.data) && r.data.length === 0))
        return "Trace status unavailable.";
      const t = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!t) return "Trace status unavailable.";
      return `HTTP Trace: ${t.traceEnable ? "ENABLED" : "DISABLED"} | L4 Trace: ${t.l4TraceEnable ? "ENABLED" : "DISABLED"}`;
    }

    case "get_worker_metrics": {
      const r = await api.aiGateway.getWorkerMetrics();
      if (!r.ok) return `Error fetching worker metrics: ${r.error.message}`;
      const workers = r.data.workers ?? [];
      const header = `GPU monitoring: ${r.data.monitoring_enabled ? "ENABLED" : "DISABLED"}`;
      if (workers.length === 0) return `${header}\nNo workers tracked.`;
      const lines = workers.map(
        (w) =>
          `${w.endpoint_ip} | queued=${w.queued_requests} | kv-cache=${w.kv_cache_usage_perc}% | swapped=${w.swapped_requests ?? 0}`
      );
      return `${header}\n${lines.join("\n")}`;
    }

    case "get_ai_gateway_status": {
      const r = await api.aiGateway.getGPUStatus();
      if (!r.ok) return `Error fetching AI-gateway status: ${r.error.message}`;
      return `GPU-aware routing: ${JSON.stringify(r.data)}`;
    }

    case "get_opa_watcher": {
      const r = await api.aiGateway.getOPAWatcher();
      if (!r.ok) return `Error fetching OPA watcher status: ${r.error.message}`;
      const s = r.data;
      return [
        `Status: ${s.status ?? "not_configured"}`,
        `OPA URL: ${s.opa_url ?? "—"} (policy: ${s.policy_path ?? "—"})`,
        `Rules: ${s.rules_count ?? 0} | Last sync: ${s.last_sync_at ?? "never"}`,
        `Circuit breaker: ${["closed", "half-open", "open"][s.circuit_breaker_state ?? 0] ?? "?"}`,
        s.last_error ? `Last error: ${s.last_error}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
