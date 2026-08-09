import type { IPsecStats } from "@/api/models";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { colors } from "../theme";

function StatRow({
  label,
  value,
  alert = false,
}: { label: string; value: string; alert?: boolean }): ReactNode {
  return (
    <box style={{ flexDirection: "row", paddingLeft: 2 }}>
      <text fg={colors.fg.muted} style={{ width: 22 }}>
        {label}:
      </text>
      <text fg={alert ? colors.status.warning : colors.fg.secondary}>{value}</text>
    </box>
  );
}

export function IPsecStatsPanel({ height }: { height: number }): ReactNode {
  const { state } = useApp();
  const { liveData } = state;
  const { loading, error, data } = liveData.ipsecStats;
  const stats: IPsecStats | null = data[0] ?? null;

  const activeTunnels = stats?.activeTunnels ?? 0;
  const totalTunnels = stats?.totalTunnels ?? 0;
  const errCount = stats?.errors ?? 0;

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      <text fg={colors.fg.secondary}>
        IPsec Statistics
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      {!stats && !loading && <text fg={colors.fg.muted}> No IPsec statistics available.</text>}
      {stats && (
        <box style={{ flexDirection: "column", paddingTop: 1 }}>
          <text fg={colors.fg.secondary} style={{ paddingLeft: 1 }}>
            Tunnels
          </text>
          <StatRow label="Active Tunnels" value={`${activeTunnels} / ${totalTunnels}`} />
          <text fg={colors.fg.muted}> </text>
          <text fg={colors.fg.secondary} style={{ paddingLeft: 1 }}>
            Traffic
          </text>
          <StatRow
            label="Inbound Bytes"
            value={stats.inboundBytes != null ? String(stats.inboundBytes) : "—"}
          />
          <StatRow
            label="Outbound Bytes"
            value={stats.outboundBytes != null ? String(stats.outboundBytes) : "—"}
          />
          <StatRow
            label="Inbound Packets"
            value={stats.inboundPackets != null ? String(stats.inboundPackets) : "—"}
          />
          <StatRow
            label="Outbound Packets"
            value={stats.outboundPackets != null ? String(stats.outboundPackets) : "—"}
          />
          <text fg={colors.fg.muted}> </text>
          <text fg={colors.fg.secondary} style={{ paddingLeft: 1 }}>
            Errors
          </text>
          <StatRow label="Error Count" value={String(errCount)} alert={errCount > 0} />
        </box>
      )}
    </box>
  );
}
