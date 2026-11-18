import type {
  AuditStatus,
  CapabilityStatus,
  HalfCloseConfig,
  MaintenanceStatus,
  ReadyStatus,
} from "@/api/models";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { colors } from "../theme";

function Stat({
  label,
  value,
  color,
}: { label: string; value: string | number; color?: string }): ReactNode {
  return (
    <box
      style={{
        flexDirection: "column",
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        paddingBottom: 1,
        backgroundColor: colors.bg.tertiary,
        marginRight: 1,
        marginBottom: 1,
      }}
    >
      <text fg={colors.fg.muted}>{label}</text>
      <text fg={color ?? colors.accent.primary}>{String(value)}</text>
    </box>
  );
}

function SectionHeader({ title }: { title: string }): ReactNode {
  return (
    <text fg={colors.fg.secondary} style={{ marginTop: 1 }}>
      ── {title} ──
    </text>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)}M`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)}K`;
  return `${bytes}B`;
}

/** Mounted with the dashboard, so these reads only poll while it is on screen. */
function GatewayHealth(): ReactNode {
  const { state } = useApp();
  const [readiness, setReadiness] = useState<ReadyStatus | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([]);
  const [halfClose, setHalfClose] = useState<HalfCloseConfig | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditStatus | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state.tickCount re-triggers the fetch on every poll cycle
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      state.api.status.ready(),
      state.api.status.maintenance(),
      state.api.status.capabilities(),
      state.api.lb.getHalfClose(),
      state.api.audit.getStatus(),
    ]).then(([readyR, maintR, capsR, halfCloseR, auditR]) => {
      if (cancelled) return;
      setReadiness(readyR.ok ? readyR.data : null);
      setMaintenance(maintR.ok ? maintR.data : null);
      setCapabilities(capsR.ok ? capsR.data.capabilities : []);
      setHalfClose(halfCloseR.ok ? halfCloseR.data : null);
      setAuditTrail(auditR.ok ? auditR.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [state.tickCount, state.api]);

  if (!readiness && !maintenance && capabilities.length === 0 && !halfClose && !auditTrail) {
    return null;
  }

  const inMaintenance = maintenance?.state === "maintenance";
  // While not ready or draining, the reasons and drain progress take the room of the
  // routine segments.
  const degraded = readiness?.ready === false || inMaintenance;
  const segments: Array<{ label: string; value: string; color?: string }> = [];
  if (readiness) {
    const reasons = readiness.reasons?.length ? ` (${readiness.reasons.join(", ")})` : "";
    segments.push({
      label: "",
      value: readiness.ready ? "READY" : `NOT READY${reasons}`,
      color: readiness.ready ? colors.status.success : colors.status.error,
    });
  }
  if (maintenance) {
    const drain = maintenance.drain_timeout_seconds
      ? `${maintenance.elapsed_seconds}s / ${maintenance.drain_timeout_seconds}s`
      : `${maintenance.elapsed_seconds}s`;
    const refusing = [
      maintenance.refusing_new_config && "config",
      maintenance.refusing_new_inference && "inference",
    ]
      .filter(Boolean)
      .join(", ");
    segments.push({
      label: "maintenance",
      value: inMaintenance ? `ON ${drain}${refusing && `, refusing ${refusing}`}` : "off",
      color: !inMaintenance
        ? colors.fg.muted
        : maintenance.drain_deadline_exceeded
          ? colors.status.error
          : colors.status.warning,
    });
    if (inMaintenance || !degraded) {
      segments.push({
        label: "in-flight",
        value: `${maintenance.in_flight_requests ?? 0} req / ${maintenance.in_flight_streams} SSE`,
      });
    }
  }
  if (auditTrail) {
    segments.push(
      auditTrail.available === false
        ? { label: "audit", value: "unavailable", color: colors.status.error }
        : auditTrail.running
          ? { label: "audit", value: "running", color: colors.status.success }
          : { label: "audit", value: "restarting", color: colors.status.warning }
    );
  }
  if (halfClose && !degraded) {
    const cap = halfClose.capSeconds != null ? `${halfClose.capSeconds}s` : "—";
    segments.push({
      label: "half-close",
      value: `${halfClose.allow === false ? "blocked" : "allowed"} ${cap}, default ${halfClose.defaultMode ?? "—"}`,
    });
  }
  if (capabilities.length > 0 && !degraded) {
    // Not gateway health: an unready optional capability leaves the gateway ready.
    const notReady = capabilities
      .filter((c) => !c.ready)
      .map((c) => (c.reason_code ? `${c.name} (${c.reason_code})` : c.name));
    segments.push({
      label: "caps",
      value: `${capabilities.length - notReady.length}/${capabilities.length}${
        notReady.length ? `, not ready: ${notReady.join(", ")}` : ""
      }`,
      color: colors.fg.secondary,
    });
  }

  // Never wraps: at 40 rows the dashboard has one spare row, and a second would push
  // the sections below over each other.
  return (
    <text fg={colors.fg.muted} wrapMode="none">
      {segments.map(({ label, value, color }, i) => (
        <Fragment key={label}>
          {i > 0 && " · "}
          {label && `${label} `}
          <span fg={color ?? colors.fg.primary}>{value}</span>
        </Fragment>
      ))}
    </text>
  );
}

export function DashboardPanel({ height }: { height: number }): ReactNode {
  const { state } = useApp();
  const { liveData } = state;

  // System info
  const device = liveData.device.data;
  const hostname = device?.hostName ?? "—";
  const os = device?.OS ?? "—";
  const kernel = device?.kernel ?? "—";
  const arch = device?.architecture ?? "—";

  // Uptime from API is a string of space-separated seconds (e.g. "7790620.17 30490382.76").
  // Take the first number and convert to a human-readable duration.
  const rawUptime = device?.uptime ?? "";
  const uptimeSecs = Number.parseFloat(rawUptime.split(" ")[0] ?? "");
  const uptime = (() => {
    if (!rawUptime || Number.isNaN(uptimeSecs)) return "—";
    const d = Math.floor(uptimeSecs / 86400);
    const h = Math.floor((uptimeSecs % 86400) / 3600);
    const m = Math.floor((uptimeSecs % 3600) / 60);
    const s = Math.floor(uptimeSecs % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  })();

  // Version
  const version = liveData.version.data?.version ?? "—";
  const buildInfo = liveData.version.data?.buildInfo;

  // Resource counts
  const lbCount = liveData.lb.data.length;
  const epCount = liveData.ep.data.length;
  const ctCount = liveData.ct.data.length;
  const clusterCount = liveData.cluster.data.length;
  const routeCount = liveData.routes.data.length;
  const portCount = liveData.ports.data.length;
  const fwCount = liveData.firewall.data.length;

  // Trace status
  const traceData = liveData.trace.data;
  const httpTrace = traceData.find((t) => t.label === "HTTP");
  const l4Trace = traceData.find((t) => t.label === "L4");

  // API health — check all data slices
  const errors = [
    liveData.lb.error,
    liveData.ep.error,
    liveData.ct.error,
    liveData.cluster.error,
    liveData.routes.error,
    liveData.status.error,
    liveData.ports.error,
    liveData.firewall.error,
    liveData.filesystem.error,
    liveData.device.error,
    liveData.version.error,
  ].filter(Boolean);
  const apiOk = errors.length === 0;

  // Process stats
  const statusData = liveData.status.data;
  const processCount = statusData.length;

  // Port aggregate network stats
  const totalRxBytes = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.rxBytes ?? 0),
    0
  );
  const totalTxBytes = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.txBytes ?? 0),
    0
  );
  const totalRxPkts = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.rxPackets ?? 0),
    0
  );
  const totalTxPkts = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.txPackets ?? 0),
    0
  );
  const totalRxErr = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.rxErrors ?? 0),
    0
  );
  const totalTxErr = liveData.ports.data.reduce(
    (sum, p) => sum + (p.portStatisticInformation?.txErrors ?? 0),
    0
  );

  // Filesystem / disk
  const fsData = liveData.filesystem.data;

  // Active ports (link=true means link-up in Go bool field)
  const activePorts = liveData.ports.data.filter(
    (p) => p.portHardwareInformation?.link === true
  ).length;

  // Cluster info
  const masterNodes = liveData.cluster.data.filter(
    (n) => n.state?.toLowerCase() === "master"
  ).length;
  const backupNodes = liveData.cluster.data.filter(
    (n) => n.state?.toLowerCase() === "backup"
  ).length;

  return (
    <box
      style={{
        width: "100%",
        height,
        flexDirection: "column",
        paddingLeft: 1,
        paddingTop: 1,
        overflow: "hidden",
      }}
    >
      <text fg={colors.fg.secondary}>Dashboard</text>

      {/* ── System Info ── */}
      <SectionHeader title="System" />
      <box style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Stat label="Hostname" value={hostname} />
        <Stat label="OS" value={os} />
        <Stat label="Kernel" value={kernel} />
        <Stat label="Arch" value={arch} />
        <Stat label="Uptime" value={uptime} />
        <Stat label="LoxiLB" value={buildInfo ? `${version} (${buildInfo})` : version} />
        <Stat
          label="API"
          value={apiOk ? "OK" : `ERR(${errors.length})`}
          color={apiOk ? colors.status.success : colors.status.error}
        />
      </box>

      <GatewayHealth />

      {/* ── Resources ── */}
      <SectionHeader title="Resources" />
      <box style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Stat label="LB Services" value={lbCount} />
        <Stat label="Endpoints" value={epCount} />
        <Stat label="Conntrack" value={ctCount} />
        <Stat label="Routes" value={routeCount} />
        <Stat label="Firewall Rules" value={fwCount} />
        <Stat
          label={`Cluster (${clusterCount})`}
          value={`M:${masterNodes} B:${backupNodes}`}
          color={masterNodes > 0 ? colors.status.success : colors.status.warning}
        />
      </box>

      {/* ── Network Ports ── */}
      <SectionHeader title="Network" />
      <box style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Stat
          label={`Ports (${portCount})`}
          value={`Up: ${activePorts}`}
          color={activePorts > 0 ? colors.status.success : colors.status.warning}
        />
        <Stat label="RX Bytes" value={fmtBytes(totalRxBytes)} />
        <Stat label="TX Bytes" value={fmtBytes(totalTxBytes)} />
        <Stat label="RX Pkts" value={totalRxPkts.toLocaleString()} />
        <Stat label="TX Pkts" value={totalTxPkts.toLocaleString()} />
        {(totalRxErr > 0 || totalTxErr > 0) && (
          <Stat
            label="Errors (RX/TX)"
            value={`${totalRxErr}/${totalTxErr}`}
            color={colors.status.error}
          />
        )}
        {traceData.length > 0 && (
          <Stat
            label="HTTP Trace"
            value={httpTrace?.traceEnable ? "ON" : "OFF"}
            color={httpTrace?.traceEnable ? colors.status.warning : colors.fg.muted}
          />
        )}
        {traceData.length > 0 && (
          <Stat
            label="L4 Trace"
            value={l4Trace?.l4TraceEnable ? "ON" : "OFF"}
            color={l4Trace?.l4TraceEnable ? colors.status.warning : colors.fg.muted}
          />
        )}
      </box>

      {/* ── Disk ── */}
      {fsData.length > 0 && (
        <box style={{ flexDirection: "column" }}>
          <SectionHeader title="Disk" />
          {fsData.map((fs, i) => {
            const pct =
              fs.usedPercent ?? (fs.total && fs.used ? (fs.used / fs.total) * 100 : undefined);
            const pctColor =
              pct === undefined
                ? colors.accent.primary
                : pct >= 90
                  ? colors.status.error
                  : pct >= 75
                    ? colors.status.warning
                    : colors.status.success;
            const bar =
              pct !== undefined ? `[${"#".repeat(Math.round(pct / 5)).padEnd(20, ".")}]` : "";
            return (
              <text key={i} fg={colors.fg.primary}>
                <span fg={colors.accent.primary}>{fs.mountPoint ?? fs.device ?? "?"}</span>
                {fs.fsType ? <span fg={colors.fg.muted}> ({fs.fsType})</span> : ""}
                {fs.total ? <span fg={colors.fg.muted}> {fmtBytes(fs.total)}</span> : ""}
                {pct !== undefined ? (
                  <span fg={pctColor}>
                    {" "}
                    {bar} {pct.toFixed(1)}%
                  </span>
                ) : (
                  ""
                )}
                {fs.used !== undefined && fs.total !== undefined ? (
                  <span fg={colors.fg.muted}>
                    {" used "}
                    {fmtBytes(fs.used)}
                    {" / free "}
                    {fmtBytes(fs.free ?? fs.total - fs.used)}
                  </span>
                ) : (
                  ""
                )}
              </text>
            );
          })}
        </box>
      )}

      {/* ── Processes ── */}
      {processCount > 0 && (
        <box style={{ flexDirection: "column" }}>
          <SectionHeader title={`Processes (${processCount})`} />
          {statusData.map((p, i) => (
            <text key={i} fg={colors.fg.primary}>
              <span fg={colors.fg.muted}>PID {p.pid ?? "?"}</span>{" "}
              <span fg={colors.accent.primary}>{p.command ?? "?"}</span>
              {p.status ? <span fg={colors.fg.muted}> [{p.status}]</span> : ""}
              {p.CPUUsage ? <span fg={colors.accent.secondary}> CPU:{p.CPUUsage}</span> : ""}
              {p.MemoryUsage ? <span fg={colors.accent.tertiary}> MEM:{p.MemoryUsage}</span> : ""}
              {p.residentSize ? <span fg={colors.fg.muted}> RSS:{p.residentSize}</span> : ""}
            </text>
          ))}
        </box>
      )}

      {/* ── API Errors ── */}
      {errors.length > 0 && (
        <box style={{ flexDirection: "column" }}>
          <SectionHeader title="API Errors" />
          {errors.map((e, i) => (
            <text key={i} fg={colors.status.error}>
              {e}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
