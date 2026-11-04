import type { FirewallEntry, FirewallOptionEntry } from "@/api/models";
import { filterBySearch, matchesAny } from "@/utils/search";
import type { ReactNode } from "react";
import { DetailPane } from "../components/DetailPane";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";
import { firewallFields } from "./detail-fields";
import { splitPanelHeight } from "./utils";

function actionLabel(opts: FirewallOptionEntry): { text: string; color: string } {
  if (opts.allow) return { text: "ALLOW", color: colors.status.success };
  if (opts.drop) return { text: "DROP", color: colors.status.error };
  if (opts.redirect) return { text: "REDIR", color: colors.status.warning };
  if (opts.trap) return { text: "TRAP", color: colors.status.warning };
  return { text: "?", color: colors.fg.muted };
}

function FwRow({ entry, selected }: { entry: FirewallEntry; selected: boolean }): ReactNode {
  const bg = selected ? colors.bg.highlight : "transparent";
  const r = entry.ruleArguments;
  const action = actionLabel(entry.opts);
  return (
    <box style={{ flexDirection: "row", backgroundColor: bg, paddingLeft: 1 }}>
      <text fg={colors.fg.primary} style={{ width: 18 }}>
        {r.sourceIP || "*"}
      </text>
      <text fg={colors.fg.primary} style={{ width: 18 }}>
        {r.destinationIP || "*"}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 8 }}>
        {String(r.protocol ?? "*")}
      </text>
      <text fg={colors.fg.secondary} style={{ width: 8 }}>
        {String(r.preference ?? "—")}
      </text>
      <text fg={action.color}>{action.text}</text>
    </box>
  );
}

export function SecurityPanel({
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
  const { loading, error, data } = liveData.firewall;
  const sel = selectedIndex.firewall ?? 0;
  const query = searchQuery.firewall ?? "";

  // Filter data based on search query
  const { filtered, matchCount, totalCount } = filterBySearch(data, query, (entry, q) => {
    const r = entry.ruleArguments;
    const action = actionLabel(entry.opts);
    return matchesAny(q, r.sourceIP, r.destinationIP, r.protocol, r.preference, action.text);
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
          onQueryChange={(q) => actions.setSearchQuery("firewall", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      )}
      <text fg={colors.fg.secondary}>
        Firewall Rules
        {loading && <span fg={colors.status.warning}> [refreshing...]</span>}
        {error && <span fg={colors.status.error}> [{error}]</span>}
      </text>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Source
        </text>
        <text fg={colors.fg.muted} style={{ width: 18 }}>
          Destination
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Proto
        </text>
        <text fg={colors.fg.muted} style={{ width: 8 }}>
          Pref
        </text>
        <text fg={colors.fg.muted}>Action</text>
      </box>
      {visible.map((entry, i) => (
        <FwRow key={i} entry={entry} selected={offset + i === sel} />
      ))}
      {data.length === 0 && !loading && (
        <text fg={colors.fg.muted}> No firewall rules configured.</text>
      )}
      {detailH > 0 && (
        <DetailPane
          title="Firewall Rule Detail"
          fields={selectedItem ? firewallFields(selectedItem) : []}
          height={detailH}
        />
      )}
    </box>
  );
}
