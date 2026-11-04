import type { PortEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { portFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

function linkColor(link?: unknown): string {
  if (link == null || link === "") return colors.status.warning;
  const l = String(link).toLowerCase();
  if (l === "up" || l === "yes") return colors.status.success;
  if (l === "down" || l === "no") return colors.status.error;
  return colors.status.warning;
}

function PortRow({ port, selected }: { port: PortEntry; selected: boolean }): ReactNode {
  const bg = selected ? colors.bg.highlight : "transparent";
  const hw = port.portHardwareInformation;
  return (
    <box style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
      <text fg={colors.fg.primary} style={{ width: 16 }}>
        {port.portName ?? "?"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 20 }}>
        {hw?.macAddress ?? "—"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 8 }}>
        {String(hw?.mtu ?? "—")}
      </text>
      <text fg={linkColor(hw?.link)} style={{ width: 8 }}>
        {hw?.link != null ? String(hw.link) : "?"}
      </text>
      <text fg={colors.fg.secondary}>{hw?.state ?? "?"}</text>
    </box>
  );
}

export function PortsPanel({
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
  const { loading, error, data } = liveData.ports;
  const sel = selectedIndex.ports ?? 0;
  const query = searchQuery.ports ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (port, q) => {
    const hw = port.portHardwareInformation;
    return matchesAny(
      q,
      port.portName,
      hw?.macAddress,
      hw?.mtu,
      hw?.link != null ? String(hw.link) : undefined,
      hw?.state
    );
  });

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
          onQueryChange={(q) => actions.setSearchQuery("ports", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Ports / Interfaces
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 16 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 20 }}>
          MAC
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          MTU
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Link
        </text>
        <text fg={colors.fg.muted}>State</text>
      </box>
      {visible.map((port, i) => (
        <PortRow key={i} port={port} selected={offset + i === sel} />
      ))}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No port data available.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Port Detail"
          fields={selectedItem ? portFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
