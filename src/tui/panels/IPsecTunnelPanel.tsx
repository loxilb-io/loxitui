import type { IPsecTunnel } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { ipsecTunnelFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function IPsecTunnelPanel({
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
  const { loading, error, data } = liveData.ipsecTunnels;
  const sel = selectedIndex["ipsec-tunnels"] ?? 0;
  const query = searchQuery["ipsec-tunnels"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (t, q) =>
    matchesAny(q, t.name, t.localIP, t.remoteIP, t.state, t.encAlg, t.authAlg)
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
          onQueryChange={(q) => actions.setSearchQuery("ipsec-tunnels", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        IPsec Tunnels
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Local
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Remote
        </text>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          Auth
        </text>
        <text fg={colors.fg.muted} style={{ width: 12 }}>
          Enc
        </text>
        <text fg={colors.fg.muted}>State</text>
      </box>
      {visible.map((t, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        const stateUp = t.state?.toLowerCase() === "established" || t.state?.toLowerCase() === "up";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 18 }}>
              {t.name ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {t.localIP ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 18 }}>
              {t.remoteIP ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 12 }}>
              {t.authAlg ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 12 }}>
              {t.encAlg ?? "—"}
            </text>
            <text fg={stateUp ? colors.status.success : colors.status.warning}>
              {t.state ?? "—"}
            </text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No IPsec tunnels.</text>}
      {detailH > 0 && (
        <DetailPane
          title="IPsec Tunnel"
          fields={selectedItem ? ipsecTunnelFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
