import type { MirrorGetEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { mirrorFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

const MIRROR_TYPE_LABELS: Record<number, string> = {
  0: "Span",
  1: "RSpan",
  2: "ERSpan",
};

export function MirrorPanel({
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
  const { loading, error, data } = liveData.mirrors;
  const sel = selectedIndex.mirror ?? 0;
  const query = searchQuery.mirror ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (m, q) =>
    matchesAny(
      q,
      m.ident,
      m.mirrorArguments?.mirrorPort,
      m.mirrorArguments?.targetPort,
      m.mirrorArguments?.mirrorType != null
        ? MIRROR_TYPE_LABELS[m.mirrorArguments.mirrorType]
        : undefined
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
          onQueryChange={(q) => actions.setSearchQuery("mirror", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Mirror Sessions
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          Ident
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Type
        </text>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          Mirror Port
        </text>
        <text fg={colors.fg.muted}>Target Port</text>
      </box>
      {visible.map((m, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const args = m.mirrorArguments;
        const typeStr =
          args?.mirrorType != null
            ? (MIRROR_TYPE_LABELS[args.mirrorType] ?? String(args.mirrorType))
            : "—";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 16 }}>
              {m.ident ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {typeStr}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 16 }}>
              {args?.mirrorPort ?? "—"}
            </text>
            <text fg={colors.fg.muted}>{args?.targetPort ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No mirror sessions.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Mirror Detail"
          fields={selectedItem ? mirrorFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
