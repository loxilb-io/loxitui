import type { BfdGetEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { bfdFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

function BfdRow({ entry, selected }: { entry: BfdGetEntry; selected: boolean }): ReactNode {
  const bg = selected ? colors.bg.highlight : "transparent";
  const isUp = entry.state?.toLowerCase() === "up";
  return (
    <box style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
      <text fg={colors.fg.primary} style={{ width: 18 }}>
        {entry.remoteIP ?? "?"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 18 }}>
        {entry.localIP ?? "—"}
      </text>
      <text fg={isUp ? colors.status.success : colors.status.warning} style={{ width: 10 }}>
        {entry.state ?? "?"}
      </text>
      <text fg={colors.fg.muted} style={{ width: 10 }}>
        {entry.interval != null ? `${entry.interval}ms` : "—"}
      </text>
      <text fg={colors.fg.muted}>{entry.multiplier != null ? `x${entry.multiplier}` : "—"}</text>
    </box>
  );
}

export function BfdPanel({
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
  const { loading, error, data } = liveData.bfd;
  const sel = selectedIndex.bfd ?? 0;
  const query = searchQuery.bfd ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (e, q) =>
    matchesAny(q, e.remoteIP, e.localIP, e.state)
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
          onQueryChange={(q) => actions.setSearchQuery("bfd", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        BFD Sessions
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Remote IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Local IP
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          State
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Interval
        </text>
        <text fg={colors.fg.muted}>Multi</text>
      </box>
      {visible.map((entry, i) => (
        <BfdRow key={i} entry={entry} selected={offset + i === sel} />
      ))}
      {detailH > 0 && selectedItem && (
        <DetailPane title="BFD Session" fields={bfdFields(selectedItem)} height={detailH} />
      )}
    </box>
  );
}
