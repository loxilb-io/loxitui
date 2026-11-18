import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { modelProfileFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function ModelProfilesPanel({
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
  const { loading, error, data } = liveData.modelProfiles;
  const registry = data[0];
  const profiles = registry?.profiles ?? [];
  const sel = selectedIndex["model-profiles"] ?? 0;
  const query = searchQuery["model-profiles"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(profiles, query, (p, q) =>
    matchesAny(q, p.profileId, p.baseModel, ...(p.allowedAliases ?? []))
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
          onQueryChange={(q) => actions.setSearchQuery("model-profiles", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Model Profiles
        {registry?.setDigest && (
          <span fg={colors.fg.muted}>
            {" "}
            · generation {registry.registryGeneration} · set {registry.setDigest.slice(0, 20)}…
          </span>
        )}
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 24 }}>
          Profile
        </text>
        <text fg={colors.fg.muted} style={{ width: 42 }}>
          Base Model
        </text>
        <text fg={colors.fg.muted}>APIs</text>
      </box>
      {visible.map((p, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box
            key={p.profileId}
            style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}
          >
            <text fg={colors.fg.primary} style={{ width: 24 }}>
              {p.profileId}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 42 }}>
              {p.baseModel}
            </text>
            <text fg={colors.fg.secondary}>{p.supportedApis.join(", ")}</text>
          </box>
        );
      })}
      {profiles.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No model profiles published.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Model Profile"
          fields={selectedItem ? modelProfileFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
