import type { IPsecSA } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { ipsecSAFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function IPsecSAPanel({
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
  const { loading, error, data } = liveData.ipsecSAs;
  const sel = selectedIndex["ipsec-sas"] ?? 0;
  const query = searchQuery["ipsec-sas"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (sa, q) =>
    matchesAny(q, sa.spi, sa.direction, sa.protocol, sa.mode, sa.localIP, sa.remoteIP)
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
          onQueryChange={(q) => actions.setSearchQuery("ipsec-sas", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        IPsec Security Associations
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          SPI
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Direction
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Protocol
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Mode
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Local
        </text>
        <text fg={colors.fg.muted}>Remote</text>
      </box>
      {visible.map((sa, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 12 }}>
              {sa.spi != null ? String(sa.spi) : "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {sa.direction ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {sa.protocol ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {sa.mode ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {sa.localIP ?? "—"}
            </text>
            <text fg={colors.fg.muted}>{sa.remoteIP ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No IPsec SAs.</text>}
      {detailH > 0 && (
        <DetailPane
          title="IPsec SA"
          fields={selectedItem ? ipsecSAFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
