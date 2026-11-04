import type { AuthState } from "@/api";
import type { ReactNode } from "react";
import { TAB_GROUPS, colors, keyHints, layout } from "../theme";
import type { TabId } from "../theme";

interface HeaderProps {
  host: string;
  port: number;
  tls: boolean;
  activeTab: TabId;
  lastUpdated: number;
  auth?: AuthState;
}

/** Compact auth indicator: "jwt:user" (green), "jwt!" on error, "token", or nothing. */
function authLabel(auth?: AuthState): { text: string; color: string } | null {
  if (!auth || auth.mode === "none") return null;
  if (auth.mode === "static-token") return { text: "token", color: colors.fg.muted };
  if (auth.error) return { text: `jwt:${auth.username ?? "?"}!`, color: colors.status.error };
  return { text: `jwt:${auth.username ?? "?"}`, color: colors.status.success };
}

export function Header({ host, port, tls, activeTab, lastUpdated, auth }: HeaderProps): ReactNode {
  const scheme = tls ? "https" : "http";
  const ts = lastUpdated > 0 ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--";
  const authInfo = authLabel(auth);

  // Build breadcrumb: "GROUP › Full Tab Name"
  let breadcrumb = "";
  for (const group of TAB_GROUPS) {
    const tab = group.tabs.find((t) => t.id === activeTab);
    if (tab) {
      breadcrumb = `${group.label} › ${tab.fullLabel}`;
      break;
    }
  }

  return (
    <box
      style={{
        width: "100%",
        height: layout.header.height,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text>
        <span fg={colors.accent.primary}>⬡ loxitui</span>
        <span fg={colors.fg.muted}> │ </span>
        <span fg={colors.fg.secondary}>
          {scheme}://{host}:{port}
        </span>
        {authInfo ? (
          <>
            <span fg={colors.fg.muted}> │ </span>
            <span fg={authInfo.color}>{authInfo.text}</span>
          </>
        ) : null}
      </text>
      <text>
        <span fg={colors.fg.muted}>● </span>
        <span fg={colors.accent.primary}>{breadcrumb}</span>
      </text>
      <text>
        <span fg={colors.fg.muted}>updated: </span>
        <span fg={colors.fg.secondary}>{ts}</span>
      </text>
    </box>
  );
}

interface TabBarProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}

export function TabBar({ activeTab }: TabBarProps): ReactNode {
  const activeGroup = TAB_GROUPS.find((g) => g.tabs.some((t) => t.id === activeTab));
  const activeGroupId = activeGroup?.id;

  // Build prev/next tab info for sub-nav arrows
  const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
  const globalIdx = allTabs.findIndex((t) => t.id === activeTab);
  const prevTabItem = globalIdx > 0 ? allTabs[globalIdx - 1] : allTabs[allTabs.length - 1];
  const nextTabItem = globalIdx < allTabs.length - 1 ? allTabs[globalIdx + 1] : allTabs[0];

  return (
    <box
      style={{
        width: "100%",
        height: layout.tabBar.height,
        flexDirection: "column",
        backgroundColor: colors.bg.tertiary,
      }}
    >
      {/* Row 1: All groups overview */}
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        {TAB_GROUPS.map((group, gi) => {
          const isActiveGroup = group.id === activeGroupId;
          return (
            <text key={group.id}>
              <span fg={colors.fg.muted}>{gi > 0 ? " ┃ " : ""}</span>
              <span fg={isActiveGroup ? colors.accent.primary : colors.fg.muted}>
                {"● "}
                {group.label}
              </span>
              {group.tabs.map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                  <span key={tab.id} fg={isActive ? colors.accent.primary : colors.fg.secondary}>
                    {`  ${tab.label} `}
                  </span>
                );
              })}
            </text>
          );
        })}
      </box>

      {/* Row 2: Sub-navigation — current group tabs with ‹ [Active] › position */}
      <box style={{ flexDirection: "row", paddingLeft: 1, backgroundColor: colors.bg.secondary }}>
        <text>
          <span fg={colors.fg.muted}>{"‹ "}</span>
          <span fg={colors.fg.dim}>{prevTabItem?.label ?? ""}</span>
          <span fg={colors.fg.muted}>{"  "}</span>
        </text>
        {activeGroup?.tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <text key={tab.id}>
              {isActive ? (
                <span fg={colors.accent.primary}>{`[${tab.fullLabel}]`}</span>
              ) : (
                <span fg={colors.fg.muted}>{`  ${tab.label}  `}</span>
              )}
            </text>
          );
        })}
        <text>
          <span fg={colors.fg.muted}>{"  "}</span>
          <span fg={colors.fg.dim}>{nextTabItem?.label ?? ""}</span>
          <span fg={colors.fg.muted}>{" ›"}</span>
          <span fg={colors.fg.dim}>{"  Tab/←→:move  [/]:group"}</span>
        </text>
      </box>
    </box>
  );
}

export function Footer({ statusMessage }: { statusMessage?: string | null }): ReactNode {
  const hints = keyHints.map((h) => `${h.key}:${h.description}`).join("  ");
  return (
    <box
      style={{
        width: "100%",
        height: layout.footer.height,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {statusMessage ? (
        <text fg={colors.status.warning}>{statusMessage}</text>
      ) : (
        <text fg={colors.fg.muted}>{hints}</text>
      )}
    </box>
  );
}
