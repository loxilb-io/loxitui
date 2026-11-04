import type { IPsecCertificate } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { ipsecCertFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function IPsecCertPanel({
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
  const { loading, error, data } = liveData.ipsecCerts;
  const sel = selectedIndex["ipsec-certs"] ?? 0;
  const query = searchQuery["ipsec-certs"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (c, q) =>
    matchesAny(q, c.name, c.subject, c.issuer, c.fingerprint)
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
          onQueryChange={(q) => actions.setSearchQuery("ipsec-certs", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        IPsec Certificates
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 30 }}>
          Subject
        </text>
        <text fg={colors.fg.muted} style={{ width: 22 }}>
          Not After
        </text>
        <text fg={colors.fg.muted}>CA</text>
      </box>
      {visible.map((c, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 18 }}>
              {c.name ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 30 }}>
              {c.subject ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 22 }}>
              {c.notAfter ?? "—"}
            </text>
            <text fg={c.isCA ? colors.accent.primary : colors.fg.muted}>
              {c.isCA ? "yes" : "no"}
            </text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No IPsec certificates.</text>}
      {detailH > 0 && (
        <DetailPane
          title="IPsec Certificate"
          fields={selectedItem ? ipsecCertFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
