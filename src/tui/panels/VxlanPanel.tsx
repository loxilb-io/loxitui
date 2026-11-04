import type { VxlanBridgeEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { vxlanFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function VxlanPanel({
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
  const { loading, error, data } = liveData.vxlans;
  const sel = selectedIndex.vxlan ?? 0;
  const query = searchQuery.vxlan ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (v, q) =>
    matchesAny(q, v.vxlanId, v.epIntf, v.peers?.map((p) => p.peerIP).join(","))
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
          onQueryChange={(q) => actions.setSearchQuery("vxlan", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        VXLAN Bridge Entries
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          VxLAN ID
        </text>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          EP Interface
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Peers
        </text>
        <text fg={colors.fg.muted}>Peer IPs</text>
      </box>
      {visible.map((v, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const peers = v.peers?.map((p) => p.peerIP ?? "?").join(", ") ?? "—";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.accent.primary} style={{ width: 10 }}>
              {String(v.vxlanId ?? "?")}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 16 }}>
              {v.epIntf ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 8 }}>
              {String(v.peers?.length ?? 0)}
            </text>
            <text fg={colors.fg.muted}>{peers}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No VXLAN entries.</text>}
      {detailH > 0 && (
        <DetailPane
          title="VXLAN Detail"
          fields={selectedItem ? vxlanFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
