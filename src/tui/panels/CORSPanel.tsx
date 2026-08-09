import type { CorsEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { corsFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function CORSPanel({
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
  const { loading, error, data } = liveData.cors;
  const sel = selectedIndex.cors ?? 0;
  const query = searchQuery.cors ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (c, q) =>
    matchesAny(q, c.corsURL, c.allowOrigin, c.allowMethods)
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
          onQueryChange={(q) => actions.setSearchQuery("cors", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        CORS Rules
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 30 }}>
          URL
        </text>
        <text fg={colors.fg.muted} style={{ width: 24 }}>
          Allow Origin
        </text>
        <text fg={colors.fg.muted}>Methods</text>
      </box>
      {visible.map((c, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 30 }}>
              {c.corsURL ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 24 }}>
              {c.allowOrigin ?? "—"}
            </text>
            <text fg={colors.fg.muted}>{c.allowMethods ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No CORS rules.</text>}
      {detailH > 0 && (
        <DetailPane
          title="CORS Rule"
          fields={selectedItem ? corsFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
