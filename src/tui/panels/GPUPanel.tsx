import type { GPUMonitoringStatus, GPUWorkerMetrics } from "@/api/models";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { colors } from "../theme";

function WorkerRow({ w, selected }: { w: GPUWorkerMetrics; selected: boolean }): ReactNode {
  const bg = selected ? colors.bg.highlight : "transparent";
  const memPct =
    w.gpuMemoryTotal && w.gpuMemoryUsed != null
      ? Math.round((w.gpuMemoryUsed / w.gpuMemoryTotal) * 100)
      : null;
  return (
    <box style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 2 }}>
      <text fg={colors.fg.primary} style={{ width: 14 }}>
        {w.workerId ?? "—"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 20 }}>
        {w.gpuModel ?? "—"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 8 }}>
        {w.gpuUtilization != null ? `${w.gpuUtilization}%` : "—"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 10 }}>
        {memPct != null ? `${memPct}%` : "—"}
      </text>
      <text fg={colors.fg.muted}>
        {w.activeConversations != null ? String(w.activeConversations) : "—"} conv
      </text>
    </box>
  );
}

export function GPUPanel({ height }: { height: number }): ReactNode {
  const { state } = useApp();
  const { liveData } = state;
  const { loading, error, data } = liveData.gpuStatus;
  const status: GPUMonitoringStatus | null = data[0] ?? null;

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      <text fg={colors.fg.secondary}>
        GPU Monitoring
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      {!status && !loading && <text fg={colors.fg.muted}> GPU monitoring data unavailable.</text>}
      {status && (
        <box style={{ flexDirection: "column", paddingTop: 1 }}>
          <box style={{ flexDirection: "row", paddingLeft: 1 }}>
            <text fg={colors.fg.muted} style={{ width: 24 }}>
              Status:
            </text>
            <text fg={status.enabled ? colors.status.success : colors.fg.muted}>
              {status.enabled ? "ENABLED" : "disabled"}
            </text>
          </box>
          <box style={{ flexDirection: "row", paddingLeft: 1 }}>
            <text fg={colors.fg.muted} style={{ width: 24 }}>
              Workers:
            </text>
            <text fg={colors.fg.secondary}>{String(status.workerCount ?? 0)}</text>
          </box>
          <box style={{ flexDirection: "row", paddingLeft: 1 }}>
            <text fg={colors.fg.muted} style={{ width: 24 }}>
              Active Conversations:
            </text>
            <text fg={colors.fg.secondary}>{String(status.activeConversations ?? 0)}</text>
          </box>
          <box style={{ flexDirection: "row", paddingLeft: 1 }}>
            <text fg={colors.fg.muted} style={{ width: 24 }}>
              Total Requests:
            </text>
            <text fg={colors.fg.secondary}>{String(status.totalRequests ?? 0)}</text>
          </box>
          {status.workers && status.workers.length > 0 && (
            <box style={{ flexDirection: "column", paddingTop: 1 }}>
              <text fg={colors.fg.secondary} style={{ paddingLeft: 1 }}>
                Workers:
              </text>
              <box style={{ flexDirection: "row", paddingLeft: 2 }}>
                <text fg={colors.fg.muted} style={{ width: 14 }}>
                  ID
                </text>
                <text fg={colors.fg.muted} style={{ width: 20 }}>
                  Model
                </text>
                <text fg={colors.fg.muted} style={{ width: 8 }}>
                  GPU%
                </text>
                <text fg={colors.fg.muted} style={{ width: 10 }}>
                  Mem%
                </text>
                <text fg={colors.fg.muted}>Conv</text>
              </box>
              {status.workers.map((w, i) => (
                <WorkerRow key={i} w={w} selected={false} />
              ))}
            </box>
          )}
        </box>
      )}
    </box>
  );
}
