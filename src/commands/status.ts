import { LoxilbApi } from "@/api";
import type { ApiResult } from "@/api/client";
import { getAuditLogger } from "@/audit";
import { loadConfig } from "@/config";
import type { ValidatedConfig } from "@/config";

/** Reuse doctor's shortReason pattern for human-readable errors */
function shortReason(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("connection refused") || lower.includes("econnrefused"))
    return "connection refused";
  if (lower.includes("unable to connect")) return "connection refused";
  if (lower.includes("timeout") || lower.includes("abort")) return "connection timed out";
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) return "host not found";
  if (lower.includes("econnreset")) return "connection reset";
  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
}

/** Extract data from ApiResult, returning null on failure */
function unwrap<T>(result: ApiResult<T>): T | null {
  return result.ok ? result.data : null;
}

const PROTO_MAP: Record<string, string> = {
  tcp: "TCP",
  udp: "UDP",
  sctp: "SCTP",
  icmp: "ICMP",
  none: "none",
  http: "HTTP",
  https: "HTTPS",
  quic: "QUIC",
};

export async function runStatus(args: string[], preloadedConfig?: ValidatedConfig): Promise<void> {
  const outputJson =
    args.includes("--output") && args[args.indexOf("--output") + 1]?.toLowerCase() === "json";
  const shortJson = args.includes("-o") && args[args.indexOf("-o") + 1]?.toLowerCase() === "json";
  const jsonMode = outputJson || shortJson;

  const config = preloadedConfig ?? (await loadConfig());
  const api = new LoxilbApi({
    host: config.loxilb.host,
    port: config.loxilb.port,
    tls: config.loxilb.tls,
    token: config.loxilb.token,
  });

  // Primary connectivity check
  const statusResult = await api.status.processes();
  if (!statusResult.ok) {
    const reason =
      statusResult.error.status > 0
        ? `HTTP ${statusResult.error.status} ${statusResult.error.message}`
        : shortReason(statusResult.error.message);
    process.stderr.write(`LoxiLB unreachable: ${reason}\n`);
    process.exit(1);
  }

  // Fetch remaining endpoints in parallel
  const [lbResult, epResult, ctResult, clusterResult, routeResult] = await Promise.allSettled([
    api.lb.list(),
    api.ep.list(),
    api.ct.list(),
    api.cluster.list(),
    api.route.list(),
  ]);

  const services = unwrap(
    lbResult.status === "fulfilled"
      ? lbResult.value
      : { ok: false as const, error: { status: 0, message: "", url: "" } }
  );
  const endpoints = unwrap(
    epResult.status === "fulfilled"
      ? epResult.value
      : { ok: false as const, error: { status: 0, message: "", url: "" } }
  );
  const conntrack = unwrap(
    ctResult.status === "fulfilled"
      ? ctResult.value
      : { ok: false as const, error: { status: 0, message: "", url: "" } }
  );
  const cluster = unwrap(
    clusterResult.status === "fulfilled"
      ? clusterResult.value
      : { ok: false as const, error: { status: 0, message: "", url: "" } }
  );
  const routes = unwrap(
    routeResult.status === "fulfilled"
      ? routeResult.value
      : { ok: false as const, error: { status: 0, message: "", url: "" } }
  );

  // ProcessInfoEntry has process info (pid, CPU), not version metadata
  const processCount = statusResult.data.length;

  if (jsonMode) {
    const output = {
      processes: processCount,
      services: services ?? [],
      endpoints: endpoints ?? [],
      conntrack: conntrack ?? [],
      cluster: cluster ?? [],
      routes: routes ?? [],
      metrics: null,
    };
    console.log(JSON.stringify(output));
  } else {
    console.log("\nloxitui status\n");
    console.log(`  Connected to ${config.loxilb.host}:${config.loxilb.port}\n`);

    const svcList = services ?? [];
    if (svcList.length === 0) {
      console.log("  No services configured.\n");
    } else {
      console.log(
        `  ${"VIP".padEnd(18)} ${"Port".padEnd(8)} ${"Proto".padEnd(7)} ${"EPs".padEnd(5)} ${"Name"}`
      );
      console.log(
        `  ${"─".repeat(18)} ${"─".repeat(8)} ${"─".repeat(7)} ${"─".repeat(5)} ${"─".repeat(20)}`
      );
      for (const svc of svcList) {
        const sa = svc.serviceArguments;
        const vip = sa.externalIP;
        const port = String(sa.port);
        const proto = PROTO_MAP[sa.protocol] ?? sa.protocol;
        const epCount = String(svc.endpoints?.length ?? 0);
        const name = sa.name || "-";
        console.log(
          `  ${vip.padEnd(18)} ${port.padEnd(8)} ${proto.padEnd(7)} ${epCount.padEnd(5)} ${name}`
        );
      }
      console.log();
    }

    const epList = endpoints ?? [];
    const ctList = conntrack ?? [];
    const clList = cluster ?? [];
    const rtList = routes ?? [];
    console.log(
      `  Endpoints: ${epList.length}  Conntrack: ${ctList.length}  Cluster nodes: ${clList.length}  Routes: ${rtList.length}\n`
    );
  }
  getAuditLogger().log({
    event: "cmd.dispatch",
    component: "cmd",
    data: { verb: "status", resource: "all", args_count: args.length, ok: true, message: "ok" },
  });
}
