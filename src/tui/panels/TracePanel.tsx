import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { traceFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function TracePanel({
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
  const { loading, error, data } = liveData.trace;
  const sel = selectedIndex.trace ?? 0;
  const query = searchQuery.trace ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (tr, q) => {
    const idx = data.indexOf(tr);
    const label = tr.label ?? (idx === 0 ? "HTTP" : "L4");
    const enabled = idx === 0 ? tr.traceEnable === true : tr.l4TraceEnable === true;
    return matchesAny(q, label, enabled ? "ENABLED" : "disabled", tr.traceProto);
  });

  const searchBarHeight = searchVisible ? 3 : 0;
  const adjustedHeight = height - searchBarHeight;

  const { listH, detailH } = splitPanelHeight(adjustedHeight);
  const contentH = listH - 4;
  const offset = Math.max(0, sel - Math.floor(contentH / 2));
  const visible = filtered.slice(offset, offset + contentH);
  const selectedItem = filtered[sel] ?? null;

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      {searchVisible && onSearchClose && (
        <SearchBar
          query={query}
          onQueryChange={(q) => actions.setSearchQuery("trace", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Trace Status
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <text fg={colors.fg.muted}> Press Enter to toggle trace on selected entry</text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Type
        </text>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          Enabled
        </text>
        <text fg={colors.fg.muted}>Proto</text>
      </box>
      {visible.map((tr, i) => {
        const idx = offset + i;
        const selected = idx === sel;
        const label = tr.label ?? (idx === 0 ? "HTTP" : "L4");
        const enabled = idx === 0 ? tr.traceEnable === true : tr.l4TraceEnable === true;
        const enabledStr = enabled ? "ENABLED" : "disabled";
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.secondary} style={{ width: 8 }}>
              {label}
            </text>
            <text fg={enabled ? colors.status.success : colors.fg.muted} style={{ width: 12 }}>
              {enabledStr}
            </text>
            <text fg={colors.fg.secondary}>{tr.traceProto ?? ""}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No tracer entries.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Trace Detail"
          fields={selectedItem ? traceFields(selectedItem, sel) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
