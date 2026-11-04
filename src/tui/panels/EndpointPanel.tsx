import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { endpointFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function EndpointPanel({
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
  const { loading, error, data } = liveData.ep;
  const sel = selectedIndex.endpoints ?? 0;
  const query = searchQuery.endpoints ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (ep, q) =>
    matchesAny(q, ep.hostName, ep.probePort, ep.probeType, ep.name)
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
          onQueryChange={(q) => actions.setSearchQuery("endpoints", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Endpoints
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Port
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Proto
        </text>
        <text fg={colors.fg.muted}>Info</text>
      </box>
      {visible.map((ep, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {ep.hostName ?? "?"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 8 }}>
              {String(ep.probePort ?? "?")}
            </text>
            <text fg={colors.fg.muted} style={{ width: 10 }}>
              {ep.probeType ?? "?"}
            </text>
            <text fg={colors.fg.muted}>{ep.name ?? ""}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No endpoints configured.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Endpoint Detail"
          fields={selectedItem ? endpointFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
