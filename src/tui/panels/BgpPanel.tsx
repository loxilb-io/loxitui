import type { BgpNeighEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { bgpNeighborFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

function BgpRow({ entry, selected }: { entry: BgpNeighEntry; selected: boolean }): ReactNode {
  const bg = selected ? colors.bg.highlight : "transparent";
  const isEstablished = entry.state?.toLowerCase() === "established";
  return (
    <box style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
      <text fg={colors.fg.primary} style={{ width: 18 }}>
        {entry.ipAddress ?? "?"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 8 }}>
        {entry.remoteAs != null ? String(entry.remoteAs) : "?"}
      </text>
      <text
        fg={isEstablished ? colors.status.success : colors.status.warning}
        style={{ width: 14 }}
      >
        {entry.state ?? "?"}
      </text>
      <text fg={colors.fg.muted}>{entry.updowntime ?? "—"}</text>
    </box>
  );
}

export function BgpPanel({
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
  const { loading, error, data } = liveData.bgpNeighbors;
  const sel = selectedIndex.bgp ?? 0;
  const query = searchQuery.bgp ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (e, q) =>
    matchesAny(q, e.ipAddress, e.remoteAs, e.state, e.updowntime)
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
          onQueryChange={(q) => actions.setSearchQuery("bgp", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        BGP Neighbors
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Peer IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          ASN
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          State
        </text>
        <text fg={colors.fg.muted}>Up/Down</text>
      </box>
      {visible.map((entry, i) => (
        <BgpRow key={i} entry={entry} selected={offset + i === sel} />
      ))}
      {detailH > 0 && selectedItem && (
        <DetailPane
          title="BGP Neighbor"
          fields={bgpNeighborFields(selectedItem)}
          height={detailH}
        />
      )}
    </box>
  );
}
