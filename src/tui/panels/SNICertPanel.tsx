import type { SNICertificateEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { sniCertFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function SNICertPanel({
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
  const { loading, error, data } = liveData.sni;
  const sel = selectedIndex.sni ?? 0;
  const query = searchQuery.sni ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (s, q) =>
    matchesAny(q, s.name, s.domain, s.expiresAt, s.fingerprint)
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
          onQueryChange={(q) => actions.setSearchQuery("sni", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        SNI TLS Certificates
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 24 }}>
          Domain
        </text>
        <text fg={colors.fg.muted} style={{ width: 22 }}>
          Expires
        </text>
        <text fg={colors.fg.muted}>Fingerprint</text>
      </box>
      {visible.map((s, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 20 }}>
              {s.name ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 24 }}>
              {s.domain ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 22 }}>
              {s.expiresAt ?? "—"}
            </text>
            <text fg={colors.fg.muted}>
              {s.fingerprint ? `${s.fingerprint.slice(0, 20)}…` : "—"}
            </text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No SNI certificates.</text>}
      {detailH > 0 && (
        <DetailPane
          title="SNI Certificate"
          fields={selectedItem ? sniCertFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
