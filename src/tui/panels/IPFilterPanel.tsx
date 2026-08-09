import type { IPFilterEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { ipfilterFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

const DIRECTION_LABELS: Record<number, string> = {
  0: "Ingress",
  1: "Egress",
  2: "Both",
};

export function IPFilterPanel({
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
  const { loading, error, data } = liveData.ipfilter;
  const sel = selectedIndex.ipfilter ?? 0;
  const query = searchQuery.ipfilter ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (f, q) =>
    matchesAny(
      q,
      f.ruleArguments?.ipNet,
      f.ruleArguments?.direction != null ? DIRECTION_LABELS[f.ruleArguments.direction] : undefined,
      f.ruleArguments?.preference
    )
  );

  const searchBarHeight = searchVisible ? 3 : 0;
  const adjustedHeight = height - searchBarHeight;
  const { listH, detailH } = splitPanelHeight(adjustedHeight);
  const contentH = listH - 3;
  const offset = Math.max(0, sel - Math.floor(contentH / 2));
  const visible = filtered.slice(offset, offset + contentH);
  const selectedItem = filtered[sel] ?? null;

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      {searchVisible && onSearchClose && (
        <SearchBar
          query={query}
          onQueryChange={(q) => actions.setSearchQuery("ipfilter", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        IP Filter Rules
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          IP Net
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Direction
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Priority
        </text>
        <text fg={colors.fg.muted}>Action</text>
      </box>
      {visible.map((f, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const r = f.ruleArguments;
        const dir =
          r?.direction != null ? (DIRECTION_LABELS[r.direction] ?? String(r.direction)) : "—";
        const action = r?.block ? "BLOCK" : "ALLOW";
        const actionColor = r?.block ? colors.status.error : colors.status.success;
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {r?.ipNet ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {dir}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {r?.preference != null ? String(r.preference) : "—"}
            </text>
            <text fg={actionColor}>{action}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No IP filter rules.</text>}
      {detailH > 0 && (
        <DetailPane
          title="IP Filter"
          fields={selectedItem ? ipfilterFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
