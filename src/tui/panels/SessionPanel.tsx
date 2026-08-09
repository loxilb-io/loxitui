import type { SessionEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { sessionFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function SessionPanel({
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
  const { loading, error, data } = liveData.sessions;
  const sel = selectedIndex.session ?? 0;
  const query = searchQuery.session ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (s, q) =>
    matchesAny(q, s.ident, s.sessionIP, s.tunnelIP, s.sessionType)
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
          onQueryChange={(q) => actions.setSearchQuery("session", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Sessions
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Ident
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Session IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Tunnel IP
        </text>
        <text fg={colors.fg.muted}>Type</text>
      </box>
      {visible.map((s, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {s.ident ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {s.sessionIP ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {s.tunnelIP ?? "—"}
            </text>
            <text fg={colors.fg.muted}>{s.sessionType ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No sessions.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Session Detail"
          fields={selectedItem ? sessionFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
