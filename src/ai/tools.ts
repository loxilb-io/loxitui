import { getAuditLogger } from "@/audit";
import type { LbService, LoxilbApi } from "../api/index";

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
  {
    name: "get_ai_objectives",
    description:
      "List AI objectives (named request priorities: positive is critical, negative sheddable, zero standard) and whether the key store answered.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_identities",
    description:
      "List network-identity bindings and JWT auth profiles: how AI requests are attributed to a tenant and user, with allowed models and priority class.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_model_profiles",
    description:
      "List published model profiles (base model, aliases, supported APIs, tokenizer and template digests) and the registry generation.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_rate_limit_defaults",
    description:
      "Get an AI rate-limit defaults row: the global row, or one service's row that overrides it field-wise. Zero fields fall through.",
    inputSchema: {
      type: "object",
      properties: {
        rule_ident: {
          type: "string",
          description: "Service identity whose row to read (omit for the global row)",
        },
      },
    },
  },
  {
    name: "get_ai_user_rate_limits",
    description:
      "List a tenant's explicit per-user AI rate limits, or one user's limits including per-model token quotas.",
    inputSchema: {
      type: "object",
      properties: {
        tenant_id: {
          type: "string",
          description: "Tenant ID",
        },
        user_id: {
          type: "string",
          description: "User ID; returns that user's row with model limits (optional)",
        },
      },
      required: ["tenant_id"],
    },
  },
  {
    name: "get_kv_inventory",
    description:
      "Get the KV-cache block inventory tracked for one service endpoint: block count, hash algorithm, admission verdict.",
    inputSchema: {
      type: "object",
      properties: {
        service_id: {
          type: "number",
          description:
            "KV service ID (derived from the internal LB rule number, not the load-balancer ID)",
        },
        ep_idx: {
          type: "number",
          description: "Endpoint index in the service's KV inventory",
        },
      },
      required: ["service_id", "ep_idx"],
    },
  },
  {
    name: "get_kv_exact_status",
    description:
      "Get the resolved KV-exact status of an LB rule: model profile and engine contract binding, desired vs enforced state, reason codes.",
    inputSchema: {
      type: "object",
      properties: {
        ip: {
          type: "string",
          description: "External (VIP) IP of the LB rule",
        },
        port: {
          type: "number",
          description: "Service port of the LB rule",
        },
        protocol: {
          type: "string",
          description: "Protocol of the LB rule (default tcp)",
          default: "tcp",
        },
        model_name: {
          type: "string",
          description: "Only the rule serving this model (optional)",
        },
      },
      required: ["ip", "port"],
    },
  },
  {
    name: "get_half_close",
    description:
      "Get the half-close hold settings: whether new holds are allowed, the idle bound in seconds, and the default mode.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_readiness",
    description:
      "Get LoxiLB readiness with the reasons it is withheld, maintenance and drain state, and which optional capabilities (e.g. KV-exact admission) can be served.",
    inputSchema: {
      type: "object",
      properties: {
        model_name: {
          type: "string",
          description:
            "Model a KV-exact rule would serve; also checks its tokenizer loads (optional)",
        },
      },
    },
  },
  {
    name: "get_diagnostics",
    description:
      "Get LoxiLB diagnostics: build and API version, uptime, eBPF attachments, map utilization, dependency checks, boot replay, last persist/restore.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_audit_status",
    description:
      "Get the management audit trail status (writer state, accepted/dropped records, failures, segment, retention, sinks) with its policy and compliance sink.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_dpu_status",
    description:
      "Get DPU offload state (plugins, circuit breaker, per-pipe offload counters) and hardware flow counter totals.",
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

    case "get_ai_objectives": {
      const r = await api.aiGateway.listObjectives();
      if (!r.ok) return `Error fetching AI objectives: ${r.error.message}`;
      return JSON.stringify(r.data, null, 2);
    }

    case "get_ai_identities": {
      const [nR, jR] = await Promise.all([
        api.aiGateway.listNetIdentities(),
        api.aiGateway.listJWTAuthProfiles(),
      ]);
      const parts: string[] = [];
      if (!nR.ok) parts.push(`Error fetching network identities: ${nR.error.message}`);
      else if (nR.data.length === 0) parts.push("No network identities configured.");
      else parts.push(`Network identities:\n${JSON.stringify(nR.data, null, 2)}`);
      if (!jR.ok) parts.push(`Error fetching JWT auth profiles: ${jR.error.message}`);
      else if (jR.data.length === 0) parts.push("No JWT auth profiles configured.");
      else parts.push(`JWT auth profiles:\n${JSON.stringify(jR.data, null, 2)}`);
      return parts.join("\n\n");
    }

    case "get_ai_model_profiles": {
      const r = await api.aiGateway.listModelProfiles();
      if (!r.ok) return `Error fetching model profiles: ${r.error.message}`;
      if (!r.data.profiles?.length) return "No model profiles published.";
      return JSON.stringify(r.data, null, 2);
    }

    case "get_ai_rate_limit_defaults": {
      const ruleIdent = args.rule_ident ? String(args.rule_ident) : undefined;
      const r = await api.aiGateway.getRateLimitDefaults(ruleIdent ? "rule" : "global", ruleIdent);
      if (!r.ok) {
        if (r.error.status === 404)
          return ruleIdent
            ? `No rate-limit defaults set for ${ruleIdent}.`
            : "No global rate-limit defaults set.";
        return `Error fetching rate-limit defaults: ${r.error.message}`;
      }
      return JSON.stringify(r.data, null, 2);
    }

    case "get_ai_user_rate_limits": {
      const tenantId = String(args.tenant_id);
      if (args.user_id) {
        const userId = String(args.user_id);
        const r = await api.aiGateway.getUserRateLimit(tenantId, userId);
        if (!r.ok) {
          if (r.error.status === 404)
            return `No explicit rate limits for user ${userId} in tenant ${tenantId}; the configured defaults apply.`;
          return `Error fetching user rate limit: ${r.error.message}`;
        }
        return JSON.stringify(r.data, null, 2);
      }
      const r = await api.aiGateway.listUserRateLimits(tenantId);
      if (!r.ok) return `Error fetching user rate limits: ${r.error.message}`;
      if (r.data.length === 0)
        return `No explicit user rate limits in tenant ${tenantId}; the configured defaults apply.`;
      const rows = JSON.stringify(r.data, (k, v) => (k === "model_limits" ? undefined : v), 2);
      return `${rows}\n\nPer-model token quotas are not part of this list; pass user_id to read one user's.`;
    }

    case "get_kv_inventory": {
      const serviceId = Number(args.service_id);
      const epIdx = Number(args.ep_idx);
      const r = await api.aiGateway.getKVInventory(serviceId, epIdx);
      if (!r.ok) {
        if (r.error.status === 404)
          return `No KV inventory registered for service ${serviceId} endpoint ${epIdx}.`;
        return `Error fetching KV inventory: ${r.error.message}`;
      }
      const inv = r.data;
      return `Service ${serviceId} endpoint ${epIdx}: ${inv.total ?? 0} KV blocks | hash: ${inv.hash_algo ?? "?"} | admission: ${inv.admission ?? "—"}`;
    }

    case "get_kv_exact_status": {
      const svc = {
        externalIP: String(args.ip),
        port: Number(args.port),
        protocol: String(args.protocol || "tcp") as LbService["protocol"],
      };
      const model = args.model_name ? String(args.model_name) : undefined;
      const r = await api.lb.getKVExactStatus(svc, model);
      if (!r.ok) {
        if (r.error.status === 404) {
          const key = `${svc.externalIP}:${svc.port}/${svc.protocol}`;
          return model
            ? `No KV-exact rule for model ${model} on ${key}.`
            : `No KV-exact rule matches ${key}.`;
        }
        return `Error fetching KV-exact status: ${r.error.message}`;
      }
      return JSON.stringify(r.data, null, 2);
    }

    case "get_half_close": {
      const r = await api.lb.getHalfClose();
      if (!r.ok) return `Error fetching half-close settings: ${r.error.message}`;
      return `Half-close hold: ${JSON.stringify(r.data)}`;
    }

    case "get_readiness": {
      const [rR, mR, cR] = await Promise.all([
        api.status.ready(),
        api.status.maintenance(),
        api.status.capabilities(args.model_name ? String(args.model_name) : undefined),
      ]);
      const parts: string[] = [];

      if (rR.ok) {
        parts.push(`Readiness: ${rR.data.ready ? "READY" : "NOT READY"}`);
        for (const reason of rR.data.reasons ?? []) {
          parts.push(`  - ${reason}`);
        }
      } else {
        parts.push(`Error fetching readiness: ${rR.error.message}`);
      }

      if (mR.ok) {
        const m = mR.data;
        parts.push(
          m.state === "maintenance"
            ? [
                `Maintenance: ON for ${m.elapsed_seconds}s`,
                m.drain_timeout_seconds ? `drain window: ${m.drain_timeout_seconds}s` : "",
                `refusing config: ${m.refusing_new_config}`,
                `refusing inference: ${m.refusing_new_inference}`,
                `in-flight streams: ${m.in_flight_streams}`,
                `in-flight requests: ${m.in_flight_requests ?? 0}`,
                m.drain_deadline_exceeded ? "drain deadline exceeded" : "",
              ]
                .filter(Boolean)
                .join(" | ")
            : "Maintenance: OFF"
        );
      } else {
        parts.push(`Error fetching maintenance state: ${mR.error.message}`);
      }

      if (cR.ok) {
        const caps = cR.data.capabilities ?? [];
        parts.push(caps.length > 0 ? "Capabilities:" : "Capabilities: none gated by this build");
        for (const c of caps) {
          const usage = c.limit != null ? ` (${c.in_use ?? 0}/${c.limit} in use)` : "";
          parts.push(
            `  ${c.name}: ${c.ready ? "READY" : `NOT READY — ${c.reason ?? c.reason_code ?? "?"}`}${usage}`
          );
        }
      } else {
        parts.push(`Error fetching capabilities: ${cR.error.message}`);
      }

      return parts.join("\n");
    }

    case "get_diagnostics": {
      const r = await api.status.diagnostics();
      if (!r.ok) return `Error fetching diagnostics: ${r.error.message}`;
      return JSON.stringify(r.data, null, 2);
    }

    case "get_audit_status": {
      const [sR, pR, kR] = await Promise.all([
        api.audit.getStatus(),
        api.audit.getPolicy(),
        api.audit.getSink(),
      ]);
      return [
        sR.ok
          ? `Status:\n${JSON.stringify(sR.data, null, 2)}`
          : `Error fetching audit status: ${sR.error.message}`,
        pR.ok
          ? `Policy:\n${JSON.stringify(pR.data, null, 2)}`
          : `Error fetching audit policy: ${pR.error.message}`,
        kR.ok
          ? `Compliance sink:\n${JSON.stringify(kR.data, null, 2)}`
          : `Error fetching audit sink: ${kR.error.message}`,
      ].join("\n\n");
    }

    case "get_dpu_status": {
      const [dR, hR] = await Promise.all([api.dpu.getDebug(), api.dpu.getHWCounters()]);
      if (!dR.ok && dR.error.status === 404) return "DPU offload is not available on this gateway.";
      const parts = [
        dR.ok
          ? `Offload state:\n${JSON.stringify(dR.data, null, 2)}`
          : `Error fetching DPU offload state: ${dR.error.message}`,
      ];
      if (hR.ok) {
        const flows = hR.data.flows ?? [];
        const packets = flows.reduce((n, f) => n + (f.packets ?? 0), 0);
        const bytes = flows.reduce((n, f) => n + (f.bytes ?? 0), 0);
        parts.push(
          `Hardware counters: ${flows.length} flow rows | ${packets} packets | ${_formatBytes(bytes)}`
        );
      } else {
        parts.push(`Error fetching DPU hardware counters: ${hR.error.message}`);
      }
      return parts.join("\n\n");
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
