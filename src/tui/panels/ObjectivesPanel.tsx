import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { objectiveFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function ObjectivesPanel({
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
  const { loading, error, data } = liveData.objectives;
  const list = data[0];
  const objectives = list?.objectiveAttr ?? [];
  const sel = selectedIndex.objectives ?? 0;
  const query = searchQuery.objectives ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(objectives, query, (o, q) =>
    matchesAny(q, o.name, ...(o.services ?? []))
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
          onQueryChange={(q) => actions.setSearchQuery("objectives", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Objectives
        {list?.source && <span fg={colors.fg.muted}> · source {list.source}</span>}
        {list?.store_reachable === false && (
          <span fg={colors.status.warning}> · key store unreachable</span>
        )}
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 24 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Priority
        </text>
        <text fg={colors.fg.muted}>Services</text>
      </box>
      {visible.map((o, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={o.name} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 24 }}>
              {o.name}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {String(o.priority ?? 0)}
            </text>
            <text fg={colors.fg.secondary}>{o.services?.join(", ") || "all"}</text>
          </box>
        );
      })}
      {objectives.length === 0 && !loading && <text fg={colors.fg.muted}> No objectives.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Objective"
          fields={selectedItem ? objectiveFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
