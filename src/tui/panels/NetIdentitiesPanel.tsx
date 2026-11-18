import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { netIdentityFields, netIdentityMatch } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function NetIdentitiesPanel({
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
  const { loading, error, data } = liveData.netIdentities;
  const sel = selectedIndex["net-identities"] ?? 0;
  const query = searchQuery["net-identities"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (n, q) =>
    matchesAny(q, n.name, n.tenant, netIdentityMatch(n.match), ...(n.services ?? []))
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
          onQueryChange={(q) => actions.setSearchQuery("net-identities", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Network Identities
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Tenant
        </text>
        <text fg={colors.fg.muted} style={{ width: 38 }}>
          Match
        </text>
        <text fg={colors.fg.muted}>Enforce</text>
      </box>
      {visible.map((n, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={n.name} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {n.name}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {n.tenant}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 38 }}>
              {netIdentityMatch(n.match)}
            </text>
            <text fg={colors.fg.muted}>{n.enforce ?? "advisory"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No network-identity bindings.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Network Identity"
          fields={selectedItem ? netIdentityFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
