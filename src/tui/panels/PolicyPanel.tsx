import type { PolicyEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { policyFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function PolicyPanel({
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
  const { loading, error, data } = liveData.policies;
  const sel = selectedIndex.policy ?? 0;
  const query = searchQuery.policy ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (p, q) =>
    matchesAny(q, p.ident, p.policyArguments?.rate, p.policyArguments?.burst)
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
          onQueryChange={(q) => actions.setSearchQuery("policy", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        QoS Policies
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Ident
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Rate (bps)
        </text>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Burst (bps)
        </text>
        <text fg={colors.fg.muted}>Peak Rate</text>
      </box>
      {visible.map((p, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const args = p.policyArguments;
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {p.ident ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 14 }}>
              {args?.rate != null ? String(args.rate) : "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 14 }}>
              {args?.burst != null ? String(args.burst) : "—"}
            </text>
            <text fg={colors.fg.muted}>{args?.peakRate != null ? String(args.peakRate) : "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No QoS policies.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Policy Detail"
          fields={selectedItem ? policyFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
