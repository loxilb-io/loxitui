import type { VlanGetEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { vlanFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function VlanPanel({
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
  const { loading, error, data } = liveData.vlans;
  const sel = selectedIndex.vlan ?? 0;
  const query = searchQuery.vlan ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (v, q) =>
    matchesAny(q, v.vid, v.member?.map((m) => m.memberName).join(","))
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
          onQueryChange={(q) => actions.setSearchQuery("vlan", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        VLAN Interfaces
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          VID
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Members
        </text>
        <text fg={colors.fg.muted}>Interfaces</text>
      </box>
      {visible.map((v, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const memberNames = v.member?.map((m) => m.memberName).join(", ") ?? "—";
        const taggedCount = v.member?.filter((m) => m.tagged).length ?? 0;
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.accent.primary} style={{ width: 8 }}>
              {String(v.vid ?? "?")}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 8 }}>
              {String(v.member?.length ?? 0)} ({taggedCount}T)
            </text>
            <text fg={colors.fg.muted}>{memberNames}</text>
          </box>
        );
      })}
      {detailH > 0 && selectedItem && (
        <DetailPane title="VLAN Detail" fields={vlanFields(selectedItem)} height={detailH} />
      )}
    </box>
  );
}
