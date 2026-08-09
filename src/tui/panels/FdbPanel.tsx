import type { FDBEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { fdbFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function FdbPanel({
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
  const { loading, error, data } = liveData.fdb;
  const sel = selectedIndex.fdb ?? 0;
  const query = searchQuery.fdb ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (f, q) =>
    matchesAny(q, f.macAddress, f.dev, f.bridgeId)
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
          onQueryChange={(q) => actions.setSearchQuery("fdb", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Forwarding Database (FDB)
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 22 }}>
          MAC Address
        </text>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          Interface
        </text>
        <text fg={colors.fg.muted}>Bridge ID</text>
      </box>
      {visible.map((f, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 22 }}>
              {f.macAddress ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 16 }}>
              {f.dev ?? "—"}
            </text>
            <text fg={colors.fg.muted}>{f.bridgeId != null ? String(f.bridgeId) : "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No FDB entries.</text>}
      {detailH > 0 && (
        <DetailPane
          title="FDB Entry"
          fields={selectedItem ? fdbFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
