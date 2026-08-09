import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { clusterFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function ClusterPanel({
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
  const { loading, error, data } = liveData.cluster;
  const sel = selectedIndex.cluster ?? 0;
  const query = searchQuery.cluster ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (ci, q) =>
    matchesAny(q, ci.instance, ci.state, ci.vip, ci.sync)
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
          onQueryChange={(q) => actions.setSearchQuery("cluster", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Cluster State (HA)
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          Instance
        </text>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          State
        </text>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          VIP
        </text>
        <text fg={colors.fg.muted}>Sync</text>
      </box>
      {visible.map((ci, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const isMaster = ci.state?.toLowerCase() === "master";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 16 }}>
              {ci.instance ?? "?"}
            </text>
            <text
              fg={isMaster ? colors.status.success : colors.status.warning}
              style={{ width: 12 }}
            >
              {ci.state ?? "?"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 16 }}>
              {ci.vip ?? ""}
            </text>
            <text fg={colors.fg.secondary}>{ci.sync != null ? String(ci.sync) : "?"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No cluster state entries.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Cluster Node Detail"
          fields={selectedItem ? clusterFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
