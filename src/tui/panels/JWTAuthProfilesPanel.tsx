import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { jwtAuthProfileFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function JWTAuthProfilesPanel({
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
  const { loading, error, data } = liveData.jwtAuthProfiles;
  const sel = selectedIndex["jwt-auth-profiles"] ?? 0;
  const query = searchQuery["jwt-auth-profiles"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (p, q) =>
    matchesAny(q, p.name, p.issuer, p.default_tenant, ...(p.audiences ?? []))
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
          onQueryChange={(q) => actions.setSearchQuery("jwt-auth-profiles", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        JWT Auth Profiles
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 40 }}>
          Issuer
        </text>
        <text fg={colors.fg.muted}>Model Authz</text>
      </box>
      {visible.map((p, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={p.name} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {p.name}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 40 }}>
              {p.issuer}
            </text>
            <text fg={colors.fg.muted}>{p.model_authz ?? "claims-required"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No JWT auth profiles.</text>}
      {detailH > 0 && (
        <DetailPane
          title="JWT Auth Profile"
          fields={selectedItem ? jwtAuthProfileFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
