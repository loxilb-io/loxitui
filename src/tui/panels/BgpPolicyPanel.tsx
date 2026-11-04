import type { BgpPolicyDefinition } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { bgpPolicyFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function BgpPolicyPanel({
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
  const { loading, error, data } = liveData.bgpPolicy;
  const sel = selectedIndex["bgp-policy"] ?? 0;
  const query = searchQuery["bgp-policy"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (p, q) =>
    matchesAny(q, p.name, p.statements?.length)
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
          onQueryChange={(q) => actions.setSearchQuery("bgp-policy", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        BGP Policy Definitions
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 30 }}>
          Policy Name
        </text>
        <text fg={colors.fg.muted}>Statements</text>
      </box>
      {visible.map((p, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 30 }}>
              {p.name ?? "?"}
            </text>
            <text fg={colors.fg.secondary}>{String(p.statements?.length ?? 0)}</text>
          </box>
        );
      })}
      {detailH > 0 && selectedItem && (
        <DetailPane title="BGP Policy" fields={bgpPolicyFields(selectedItem)} height={detailH} />
      )}
    </box>
  );
}
