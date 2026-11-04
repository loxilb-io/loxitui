import type { LbServiceArg, LoadbalanceStats, LoadbalanceStatus } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DetailField } from "../components/DetailPane";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { lbServiceFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

const OPERATING_STATUS_COLORS: Record<string, string> = {
  ONLINE: colors.status.success,
  DEGRADED: colors.status.warning,
  OFFLINE: colors.fg.muted,
  ERROR: colors.status.error,
  NO_MONITOR: colors.fg.muted,
};

function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

/** Extra detail fields from the per-rule status/stats endpoints. */
function lbRuleHealthFields(
  status: LoadbalanceStatus | null,
  stats: LoadbalanceStats | null
): DetailField[] {
  const fields: DetailField[] = [];
  if (status) {
    fields.push({
      label: "Oper Status",
      value: status.operatingStatus ?? "—",
      color: OPERATING_STATUS_COLORS[status.operatingStatus ?? ""] ?? colors.fg.secondary,
    });
    fields.push({ label: "Admin State", value: status.adminStateUp ? "up" : "down" });
  }
  if (stats) {
    fields.push({ label: "Active Conns", value: String(stats.activeConnections ?? 0) });
    fields.push({ label: "Total Conns", value: String(stats.totalConnections ?? 0) });
    fields.push({ label: "Bytes In", value: formatBytes(stats.bytesIn) });
    fields.push({ label: "Bytes Out", value: formatBytes(stats.bytesOut) });
  }
  return fields;
}

function ServiceRow({
  svc,
  selected,
}: {
  svc: LbServiceArg;
  selected: boolean;
}): ReactNode {
  const sa = svc.serviceArguments;
  const epsUp = svc.endpoints?.filter((e) => e.state === "active").length ?? 0;
  const epsTotal = svc.endpoints?.length ?? 0;
  const selector =
    sa.sel === 0 ? "rr" : sa.sel === 1 ? "hash" : sa.sel === 2 ? "persist" : String(sa.sel ?? "?");

  const bg = selected ? colors.bg.highlight : "transparent";

  return (
    <box
      style={{
        flexDirection: "row",
        backgroundColor: bg,
        paddingLeft: 1,
      }}
    >
      <text fg={colors.fg.primary} style={{ width: 18 }}>
        {sa.externalIP ?? "?"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 6 }}>
        {String(sa.port ?? "?")}
      </text>
      <text fg={colors.fg.muted} style={{ width: 8 }}>
        {sa.protocol ?? "?"}
      </text>
      <text fg={epsUp > 0 ? colors.status.success : colors.status.error} style={{ width: 10 }}>
        {epsUp}/{epsTotal} UP
      </text>
      <text fg={colors.fg.muted} style={{ width: 12 }}>
        {selector}
      </text>
      <text fg={colors.fg.secondary}>{sa.name ?? ""}</text>
    </box>
  );
}

export function LBPanel({
  height,
  searchVisible = false,
  onSearchClose,
}: {
  height: number;
  searchVisible?: boolean;
  onSearchClose?: () => void;
}): ReactNode {
  const { state, actions } = useApp();
  const { liveData, selectedIndex, searchQuery } = state;
  const { loading, error, data } = liveData.lb;
  const sel = selectedIndex.services ?? 0;
  const query = searchQuery.services ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (svc, q) => {
    const sa = svc.serviceArguments;
    const selector =
      sa.sel === 0
        ? "rr"
        : sa.sel === 1
          ? "hash"
          : sa.sel === 2
            ? "persist"
            : String(sa.sel ?? "?");
    return matchesAny(q, sa.externalIP, sa.port, sa.protocol, selector, sa.name);
  });

  const searchBarHeight = searchVisible ? 3 : 0;
  const adjustedHeight = height - searchBarHeight;

  const { listH, detailH } = splitPanelHeight(adjustedHeight);
  const contentH = listH - 3;
  const offset = Math.max(0, sel - Math.floor(contentH / 2));
  const visible = filtered.slice(offset, offset + contentH);
  const selectedItem = filtered[sel] ?? null;

  // Per-rule status/stats for the selected rule; refreshed with the poll cycle.
  const [ruleStatus, setRuleStatus] = useState<LoadbalanceStatus | null>(null);
  const [ruleStats, setRuleStats] = useState<LoadbalanceStats | null>(null);
  const selIP = selectedItem?.serviceArguments.externalIP;
  const selPort = selectedItem?.serviceArguments.port;
  const selProto = selectedItem?.serviceArguments.protocol;
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.tickCount re-triggers the fetch on every poll cycle
  useEffect(() => {
    if (!selIP || !selPort) {
      setRuleStatus(null);
      setRuleStats(null);
      return;
    }
    let cancelled = false;
    const target = { externalIP: selIP, port: selPort, protocol: selProto };
    void Promise.all([state.api.lb.getStatus(target), state.api.lb.getStats(target)]).then(
      ([statusR, statsR]) => {
        if (cancelled) return;
        setRuleStatus(statusR.ok ? statusR.data : null);
        setRuleStats(statsR.ok ? statsR.data : null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selIP, selPort, selProto, state.tickCount, state.api]);

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      {searchVisible && onSearchClose && (
        <SearchBar
          query={query}
          onQueryChange={(q) => actions.setSearchQuery("services", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Load Balancer Services
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          VIP
        </text>
        <text fg={colors.fg.muted} style={{ width: 6 }}>
          Port
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Proto
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Endpoints
        </text>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          Selector
        </text>
        <text fg={colors.fg.muted}>Name</text>
      </box>
      {visible.map((svc, i) => (
        <ServiceRow key={i} svc={svc} selected={offset + i === sel} />
      ))}
      {data.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No load balancer services. Press n to create one.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Service Detail"
          fields={
            selectedItem
              ? [...lbServiceFields(selectedItem), ...lbRuleHealthFields(ruleStatus, ruleStats)]
              : []
          }
          height={detailH}
        />
      )}
    </box>
  );
}
