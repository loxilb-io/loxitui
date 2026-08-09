import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { conntrackFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function ConntrackPanel({
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
  const { loading, error, data } = liveData.ct;
  const sel = selectedIndex.conntrack ?? 0;
  const query = searchQuery.conntrack ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (ct, q) =>
    matchesAny(
      q,
      ct.sourceIP,
      ct.sourcePort,
      ct.destinationIP,
      ct.destinationPort,
      ct.protocol,
      ct.conntrackState,
      ct.conntrackAct
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
          onQueryChange={(q) => actions.setSearchQuery("conntrack", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Connection Tracking ({data.length} entries)
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Src IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 7 }}>
          Port
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Dst IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 7 }}>
          Port
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Proto
        </text>
        <text fg={colors.fg.muted}>State</text>
      </box>
      {visible.map((ct, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 18 }}>
              {ct.sourceIP ?? "?"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 7 }}>
              {String(ct.sourcePort ?? "?")}
            </text>
            <text fg={colors.fg.primary} style={{ width: 18 }}>
              {ct.destinationIP ?? "?"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 7 }}>
              {String(ct.destinationPort ?? "?")}
            </text>
            <text fg={colors.fg.muted} style={{ width: 8 }}>
              {ct.protocol ?? "?"}
            </text>
            <text fg={colors.accent.secondary}>{ct.conntrackState ?? ct.conntrackAct ?? "?"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No active connections.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Connection Detail"
          fields={selectedItem ? conntrackFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
