import type { NeighborEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { neighborFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function NeighborPanel({
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
  const { loading, error, data } = liveData.neighbors;
  const sel = selectedIndex.neighbor ?? 0;
  const query = searchQuery.neighbor ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (n, q) =>
    matchesAny(q, n.ipAddress, n.macAddress, n.dev, n.state)
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
          onQueryChange={(q) => actions.setSearchQuery("neighbor", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        ARP Neighbors
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          IP Address
        </text>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          MAC Address
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Interface
        </text>
        <text fg={colors.fg.muted}>State</text>
      </box>
      {visible.map((n, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const stateUp = n.state?.toLowerCase().includes("reachable");
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 18 }}>
              {n.ipAddress ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 20 }}>
              {n.macAddress ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 14 }}>
              {n.dev ?? "—"}
            </text>
            <text fg={stateUp ? colors.status.success : colors.fg.muted}>{n.state ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No ARP neighbors.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Neighbor Detail"
          fields={selectedItem ? neighborFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
