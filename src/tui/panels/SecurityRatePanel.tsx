import type { SecurityRateEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { secrateFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function SecurityRatePanel({
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
  const { loading, error, data } = liveData.secrate;
  const sel = selectedIndex.secrate ?? 0;
  const query = searchQuery.secrate ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (s, q) =>
    matchesAny(q, s.ident, s.config?.rateLimit, s.config?.burstLimit)
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
          onQueryChange={(q) => actions.setSearchQuery("secrate", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Security Rate Limits
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Ident
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Rate
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Burst
        </text>
        <text fg={colors.fg.muted}>Active Blocks</text>
      </box>
      {visible.map((s, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const activeBlocks = s.stats?.activeBlocks ?? 0;
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {s.ident ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 14 }}>
              {s.config?.rateLimit != null ? String(s.config.rateLimit) : "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 14 }}>
              {s.config?.burstLimit != null ? String(s.config.burstLimit) : "—"}
            </text>
            <text fg={activeBlocks > 0 ? colors.status.warning : colors.fg.secondary}>
              {String(activeBlocks)}
            </text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No security rate limits.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Security Rate"
          fields={selectedItem ? secrateFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
