import type { TraceParserInfo } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { traceParserFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

export function TraceParsersPanel({
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
  const { loading, error, data } = liveData.traceParsers;
  const catalogs = liveData.traceCatalogs.data;
  const sel = selectedIndex["trace-parsers"] ?? 0;
  const query = searchQuery["trace-parsers"] ?? "";

  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (p, q) =>
    matchesAny(q, p.name, p.protocol, p.description, ...(p.capabilities ?? []))
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
          onQueryChange={(q) => actions.setSearchQuery("trace-parsers", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Trace Parsers
        {catalogs.length > 0 && <span fg={colors.fg.muted}> · {catalogs.length} catalogs</span>}
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 14 }}>
          Name
        </text>
        <text fg={colors.fg.muted} style={{ width: 10 }}>
          Version
        </text>
        <text fg={colors.fg.muted} style={{ width: 22 }}>
          Protocol
        </text>
        <text fg={colors.fg.muted}>Capabilities</text>
      </box>
      {visible.map((p, i) => {
        const selected = offset + i === sel;
        const bg = selected ? colors.bg.highlight : "transparent";
        return (
          <box key={i} style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
            <text fg={colors.fg.primary} style={{ width: 14 }}>
              {p.name ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 10 }}>
              {p.version ?? "—"}
            </text>
            <text fg={colors.fg.secondary} style={{ width: 22 }}>
              {p.protocol ?? "—"}
            </text>
            <text fg={colors.fg.secondary}>{p.capabilities?.join(", ") ?? "—"}</text>
          </box>
        );
      })}
      {data.length === 0 && !loading && <text fg={colors.fg.muted}> No trace parsers.</text>}
      {detailH > 0 && (
        <DetailPane
          title="Trace Parser"
          fields={selectedItem ? traceParserFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
