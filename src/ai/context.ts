import type { AppState } from "@/tui/state";

const MAX_CONTEXT_CHARS = 2000;

export class ContextBuilder {
  build(state: AppState): string {
    const lines: string[] = [];

    lines.push("## LoxiLB Live State");
    lines.push(`Host: ${state.config.loxilb.host}:${state.config.loxilb.port}`);
    lines.push(`Active Tab: ${state.activeTab}`);
    lines.push("");

    // LB Services
    const lbData = state.liveData.lb;
    if (lbData.data.length > 0) {
      lines.push(`### Load Balancer Services (${lbData.data.length})`);
      for (const arg of lbData.data.slice(0, 5)) {
        const sa = arg.serviceArguments;
        const eps = arg.endpoints?.length ?? 0;
        const up = arg.endpoints?.filter((e) => e.state === "active").length ?? 0;
        lines.push(`- ${sa.externalIP}:${sa.port}/${sa.protocol} -> ${up}/${eps} endpoints UP`);
      }
      if (lbData.data.length > 5) lines.push(`  ... and ${lbData.data.length - 5} more`);
      lines.push("");
    }

    // Cluster State
    const clData = state.liveData.cluster;
    if (clData.data.length > 0) {
      lines.push("### Cluster (HA) State");
      for (const ci of clData.data) {
        lines.push(`- Instance ${ci.instance}: ${ci.state}`);
      }
      lines.push("");
    }

    // Process Status (ProcessInfoEntry: system processes, not version metadata)
    const stData = state.liveData.status;
    if (stData.data.length > 0) {
      lines.push(`### LoxiLB Processes (${stData.data.length})`);
      for (const p of stData.data.slice(0, 3)) {
        lines.push(`- PID ${p.pid ?? "?"}: ${p.command ?? "?"} (CPU: ${p.CPUUsage ?? "?"})`);
      }
      lines.push("");
    }

    let result = lines.join("\n");
    if (result.length > MAX_CONTEXT_CHARS) {
      result = `${result.slice(0, MAX_CONTEXT_CHARS)}\n...[truncated]`;
    }
    return result;
  }
}
