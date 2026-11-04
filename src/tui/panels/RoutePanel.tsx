import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { routeFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function RoutePanel({
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
  const { loading, error, data } = liveData.routes;
  const sel = selectedIndex.routes ?? 0;
  const query = searchQuery.routes ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (r, q) =>
    matchesAny(q, r.destinationIPNet, r.gateway, r.ifname)
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
          onQueryChange={(q) => actions.setSearchQuery("routes", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Routes
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 22 }}>
          Destination
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Gateway
        </text>
        <text fg={colors.fg.muted}>Interface</text>
      </box>
      {visible.map((r, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 22 }}>
              {r.destinationIPNet ?? "?"}
            </text>
            <text fg={colors.accent.secondary} style={{ width: 18 }}>
              {r.gateway ?? "-"}
            </text>
            <text fg={colors.fg.secondary}>{r.ifname ?? "-"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No routes. Press n to add a route.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Route Detail"
          fields={selectedItem ? routeFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
