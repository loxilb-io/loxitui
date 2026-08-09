import { matchesSearch } from "@/utils/search";
import type { ReactNode } from "react";
import { fmtValue, renderSparkline } from "../../metrics/sparkline";
import type { MetricStore } from "../../metrics/store";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";

interface MetricRow {
  label: string;
  spark: string;
  value: string;
}

function gaugeRow(
  store: MetricStore,
  name: string,
  unit: string,
  labels?: Record<string, string>
): MetricRow {
  const tl = store.get(name, labels);
  return {
    label: name,
    spark: renderSparkline(tl?.history ?? [], 20),
    value: `${fmtValue(tl?.latest ?? 0)} ${unit}`.trim(),
  };
}

function rateRow(
  store: MetricStore,
  name: string,
  unit: string,
  labels?: Record<string, string>
): MetricRow {
  const tl = store.get(name, labels);
  const r = store.getRate(name, labels);
  return {
    label: name,
    spark: renderSparkline(tl?.history ?? [], 20),
    value: `${fmtValue(r)} ${unit}`.trim(),
  };
}

function buildSections(store: MetricStore): {
  traffic: MetricRow[];
  connections: MetricRow[];
  system: MetricRow[];
  l7proxy: MetricRow[];
  aiGateway: MetricRow[];
  hasAi: boolean;
} {
  const traffic: MetricRow[] = [
    rateRow(store, "processed_bytes_total", "B/s"),
    gaugeRow(store, "rps_1m_avg", "rps"),
    rateRow(store, "total_requests", "req/s"),
  ];

  const connections: MetricRow[] = [
    gaugeRow(store, "activeConntrackCount", ""),
    gaugeRow(store, "healthy_endpoints_count", ""),
    gaugeRow(store, "unhealthy_endpoints_count", ""),
  ];

  const system: MetricRow[] = [
    gaugeRow(store, "systemCPUUtilization", "%"),
    gaugeRow(store, "systemMemoryUtilization", "%"),
  ];

  const l7proxy: MetricRow[] = [gaugeRow(store, "proxy_active_connections", "")];
  for (const cls of ["1xx", "2xx", "3xx", "4xx", "5xx"]) {
    const tl = store.get("proxy_http_responses_by_status_total", { status_class: cls });
    if (tl) {
      l7proxy.push({
        label: `  status_class=${cls}`,
        spark: renderSparkline(tl.history, 20),
        value: `${fmtValue(
          store.getRate("proxy_http_responses_by_status_total", { status_class: cls })
        )} req/s`,
      });
    }
  }

  const hasAi = store.byPrefix("loxilb_ai_").length > 0;
  const aiGateway: MetricRow[] = hasAi
    ? [
        rateRow(store, "loxilb_ai_requests_total", "req/s"),
        gaugeRow(store, "loxilb_ai_active_streams", ""),
        rateRow(store, "loxilb_ai_rate_limit_hits_total", "hit/s"),
      ]
    : [];

  return { traffic, connections, system, l7proxy, aiGateway, hasAi };
}

function KpiRow({ store }: { store: MetricStore }): ReactNode {
  const flowCount = store.getLatest("activeConntrackCount");
  const errorCount = store.getLatest("unhealthy_endpoints_count");
  const trafficBytes = store.getLatest("processed_bytes_total");

  const fmt = (v: number | undefined): string => {
    if (v === undefined) return "—";
    return fmtValue(v);
  };

  return (
    <box style={{ flexDirection: "row", paddingLeft: 1, marginTop: 1 }}>
      <text fg={colors.accent.primary}>
        {"KPI  "}
        <span fg={colors.fg.primary}>Flows: {fmt(flowCount)}</span>
        {"  "}
        <span
          fg={errorCount !== undefined && errorCount > 0 ? colors.status.error : colors.fg.primary}
        >
          Errors: {fmt(errorCount)}
        </span>
        {"  "}
        <span fg={colors.fg.primary}>Traffic: {fmt(trafficBytes)}</span>
      </text>
    </box>
  );
}

function Section({
  title,
  rows,
  query,
}: { title: string; rows: MetricRow[]; query: string }): ReactNode {
  if (rows.length === 0) return null;
  const maxLabel = Math.max(...rows.map((r) => r.label.length), 1);

  // Filter rows based on query
  const visibleRows = query ? rows.filter((r) => matchesSearch(r.label, query)) : rows;
  if (visibleRows.length === 0) return null;

  return (
    <box style={{ flexDirection: "column", marginTop: 1 }}>
      <text fg={colors.accent.primary}> {title}</text>
      {visibleRows.map((r, i) => (
        <text key={i} fg={colors.fg.primary}>
          {"  "}
          {r.label.padEnd(maxLabel)} {r.spark} {r.value}
        </text>
      ))}
    </box>
  );
}

export function MetricsPanel({
  height,
  searchVisible = false,
  onSearchClose,
}: {
  height: number;
  searchVisible?: boolean;
  onSearchClose?: () => void;
}): ReactNode {
  const { state, actions } = useApp();
  const poller = state.metricsPoller;
  const query = state.searchQuery.metrics ?? "";
  // Reference metricsTick to trigger re-renders on each poll cycle
  void state.metricsTick;

  const searchBarHeight = searchVisible ? 3 : 0;
  const adjustedHeight = height - searchBarHeight;

  const error = poller.lastError;

  if (error) {
    const is404 = error.includes("404") || error.includes("Not Found");
    return (
      <box
        style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}
      >
        {searchVisible && onSearchClose && (
          <SearchBar
            query={query}
            onQueryChange={(q) => actions.setSearchQuery("metrics", q)}
            onClose={onSearchClose}
            width={100}
          />
        )}
        <text fg={colors.fg.secondary}>Metrics (Prometheus)</text>
        {is404 ? (
          <box style={{ flexDirection: "column", marginTop: 1 }}>
            <text fg={colors.status.warning}> ⚠ Prometheus metrics not enabled</text>
            <text fg={colors.fg.muted}>{"  "}Enable: POST /netlox/v1/config/metrics</text>
          </box>
        ) : (
          <text fg={colors.status.warning}> ⚠ {error}</text>
        )}
      </box>
    );
  }

  const store = poller.store;
  const { traffic, connections, system, l7proxy, aiGateway, hasAi } = buildSections(store);

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      {searchVisible && onSearchClose && (
        <SearchBar
          query={query}
          onQueryChange={(q) => actions.setSearchQuery("metrics", q)}
          onClose={onSearchClose}
          width={100}
        />
      )}
      <text fg={colors.fg.secondary}>Metrics (Prometheus)</text>
      <KpiRow store={store} />
      <Section title="Traffic" rows={traffic} query={query} />
      <Section title="Connections" rows={connections} query={query} />
      <Section title="System" rows={system} query={query} />
      <Section title="L7 Proxy" rows={l7proxy} query={query} />
      {hasAi && <Section title="AI Gateway" rows={aiGateway} query={query} />}
    </box>
  );
}
