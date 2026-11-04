import { getAuditLogger } from "@/audit";
import type { MouseEvent } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { buildLogAnalysisContextFromApi } from "../utils/log";
import { CommandPalette } from "./components/CommandPalette";
import { Footer, Header, TabBar } from "./components/Header";
import { CreateLbServiceForm } from "./forms/CreateLbServiceForm";
import { CreateRouteForm } from "./forms/CreateRouteForm";
import { DeleteConfirmDialog } from "./forms/DeleteConfirmDialog";
import { BfdPanel } from "./panels/BfdPanel";
// BGP group
import { BgpPanel } from "./panels/BgpPanel";
import { BgpPolicyPanel } from "./panels/BgpPolicyPanel";
import { CORSPanel } from "./panels/CORSPanel";
import { ClusterPanel } from "./panels/ClusterPanel";
import { ConntrackPanel } from "./panels/ConntrackPanel";
import { DashboardPanel } from "./panels/DashboardPanel";
import { EndpointPanel } from "./panels/EndpointPanel";
import { FdbPanel } from "./panels/FdbPanel";
// AI group
import { GPUPanel } from "./panels/GPUPanel";
// SEC additions
import { IPFilterPanel } from "./panels/IPFilterPanel";
import { IPsecCertPanel } from "./panels/IPsecCertPanel";
import { IPsecSAPanel } from "./panels/IPsecSAPanel";
import { IPsecStatsPanel } from "./panels/IPsecStatsPanel";
// IPSEC group
import { IPsecTunnelPanel } from "./panels/IPsecTunnelPanel";
import { IPv4Panel } from "./panels/IPv4Panel";
import { LBPanel } from "./panels/LBPanel";
import { LogPanel } from "./panels/LogPanel";
import { MetricsPanel } from "./panels/MetricsPanel";
import { MirrorPanel } from "./panels/MirrorPanel";
import { NeighborPanel } from "./panels/NeighborPanel";
import { PolicyPanel } from "./panels/PolicyPanel";
import { PortsPanel } from "./panels/PortsPanel";
import { RoutePanel } from "./panels/RoutePanel";
import { SNICertPanel } from "./panels/SNICertPanel";
import { SecurityPanel } from "./panels/SecurityPanel";
import { SecurityRatePanel } from "./panels/SecurityRatePanel";
import { SessionPanel } from "./panels/SessionPanel";
import { TracePanel } from "./panels/TracePanel";
import { TraceParsersPanel } from "./panels/TraceParsersPanel";
// L2 group
import { VlanPanel } from "./panels/VlanPanel";
import { VxlanPanel } from "./panels/VxlanPanel";
import { AiSidebar } from "./sidebar/AiSidebar";
import { useApp } from "./state";
import type { TabId } from "./theme";
import { TABS, colors, layout } from "./theme";

type Modal = null | "create-lb" | "create-route" | "delete-confirm" | "command-palette";

interface AppProps {
  onQuit?: () => void;
}

export function App({ onQuit }: AppProps = {}): ReactNode {
  const { state, actions } = useApp();
  const { width, height } = useTerminalDimensions();
  const [modal, setModal] = useState<Modal>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Track search visibility per tab
  const defaultSearchVisible = Object.fromEntries(TABS.map((t) => [t.id, false])) as Record<
    TabId,
    boolean
  >;
  const [searchVisible, setSearchVisible] = useState<Record<TabId, boolean>>(defaultSearchVisible);

  // Resizable AI sidebar
  const MIN_SIDEBAR_W = layout.sidebar.width;
  const MAX_SIDEBAR_W = Math.max(MIN_SIDEBAR_W, width - 20);
  const [userSidebarW, setUserSidebarW] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [dividerHovered, setDividerHovered] = useState(false);

  // Reset user width when sidebar is closed so next open starts at default
  useEffect(() => {
    if (!state.aiOpen) setUserSidebarW(null);
  }, [state.aiOpen]);

  const contentH = Math.max(
    1,
    height - layout.header.height - layout.tabBar.height - layout.footer.height
  );
  const baseSidebarW = Math.max(MIN_SIDEBAR_W, Math.round(width * 0.4));
  const sidebarW = state.aiOpen ? (userSidebarW ?? baseSidebarW) : 0;
  const dividerW = state.aiOpen ? 2 : 0;
  const panelW = width - sidebarW - dividerW;

  // Global keyboard handler (only active when no modal is open)
  useKeyboard(
    useCallback(
      (key: { name: string; ctrl?: boolean; shift?: boolean; sequence?: string }) => {
        if (modal !== null) return;

        // Check if search is visible for current tab
        const isSearchActive = searchVisible[state.activeTab] ?? false;

        // Ctrl+F toggles search for current panel (not on dashboard)
        if (key.ctrl && key.name === "f" && state.activeTab !== "dashboard") {
          setSearchVisible((prev) => ({
            ...prev,
            [state.activeTab]: !prev[state.activeTab],
          }));
          return;
        }

        // When search is active, only allow Ctrl keys and ESC - let everything else go to SearchBar
        if (isSearchActive) {
          if (key.name === "escape") {
            setSearchVisible((prev) => ({ ...prev, [state.activeTab]: false }));
            return;
          }
          // Allow Ctrl keys to pass through
          if (key.ctrl) {
            // Continue to process Ctrl keys below
          } else {
            // Block all other keys - they go to SearchBar
            return;
          }
        }

        // ':' opens command palette (when no modal/AI sidebar is open)
        if (key.sequence === ":" && !state.aiOpen) {
          setModal("command-palette");
          return;
        }

        // '['/']' switches tab groups
        if (key.sequence === "[" && !state.aiOpen) {
          actions.prevGroup();
          return;
        }
        if (key.sequence === "]" && !state.aiOpen) {
          actions.nextGroup();
          return;
        }

        if (state.aiOpen) {
          if (key.name === "escape") actions.toggleAi();
          return;
        }

        switch (key.name) {
          case "q":
          case "escape":
            if (onQuit) onQuit();
            else process.exit(0);
            break;
          case "tab":
          case "right":
            actions.nextTab();
            break;
          case "l":
            if (state.activeTab === "logs") {
              // AI log analysis (US-021)
              // claude-cli and ollama need no API key; only block unknown providers missing one
              const aiProvider = state.config.ai.provider || "claude-cli";
              if (
                aiProvider !== "claude-cli" &&
                aiProvider !== "ollama" &&
                !state.config.ai.api_key
              ) {
                actions.showStatusMessage(
                  "AI not configured. Run loxitui setup to configure a provider."
                );
                return;
              }
              if (state.aiStreaming) return;
              // Fetch log context from API asynchronously
              buildLogAnalysisContextFromApi(state.api.log).then((logCtx) => {
                if (!logCtx) {
                  actions.showStatusMessage("No log content available for analysis.");
                  return;
                }
                if (!state.aiOpen) actions.setAiOpen(true);
                getAuditLogger().log({
                  event: "tui.action",
                  component: "tui",
                  data: { action: "log_analysis_trigger" },
                });
                actions.setPendingLogAnalysis(logCtx);
              });
            } else {
              actions.nextTab();
            }
            break;
          case "left":
          case "h":
            actions.prevTab();
            break;
          case "1":
            actions.setTab("dashboard");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "dashboard" },
            });
            break;
          case "2":
            actions.setTab("services");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "services" },
            });
            break;
          case "3":
            actions.setTab("endpoints");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "endpoints" },
            });
            break;
          case "4":
            actions.setTab("conntrack");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "conntrack" },
            });
            break;
          case "5":
            actions.setTab("routes");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "routes" },
            });
            break;
          case "6":
            actions.setTab("cluster");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "cluster" },
            });
            break;
          case "7":
            actions.setTab("trace");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "trace" },
            });
            break;
          case "8":
            actions.setTab("metrics");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "metrics" },
            });
            break;
          case "9":
            actions.setTab("logs");
            getAuditLogger().log({
              event: "tui.action",
              component: "tui",
              data: { action: "panel_switch", detail: "logs" },
            });
            break;
          case "up":
          case "k": {
            const tabMaxes: Record<string, number> = {
              services: state.liveData.lb.data.length,
              endpoints: state.liveData.ep.data.length,
              conntrack: state.liveData.ct.data.length,
              routes: state.liveData.routes.data.length,
              cluster: state.liveData.cluster.data.length,
              trace: state.liveData.trace.data.length,
              ports: state.liveData.ports.data.length,
              firewall: state.liveData.firewall.data.length,
              bgp: state.liveData.bgpNeighbors.data.length,
              "bgp-policy": state.liveData.bgpPolicy.data.length,
              bfd: state.liveData.bfd.data.length,
              vlan: state.liveData.vlans.data.length,
              vxlan: state.liveData.vxlans.data.length,
              session: state.liveData.sessions.data.length,
              policy: state.liveData.policies.data.length,
              mirror: state.liveData.mirrors.data.length,
              ipv4addr: state.liveData.ipv4addrs.data.length,
              neighbor: state.liveData.neighbors.data.length,
              fdb: state.liveData.fdb.data.length,
              ipfilter: state.liveData.ipfilter.data.length,
              secrate: state.liveData.secrate.data.length,
              sni: state.liveData.sni.data.length,
              cors: state.liveData.cors.data.length,
              "ipsec-tunnels": state.liveData.ipsecTunnels.data.length,
              "ipsec-sas": state.liveData.ipsecSAs.data.length,
              "ipsec-certs": state.liveData.ipsecCerts.data.length,
              "trace-parsers": state.liveData.traceParsers.data.length,
            };
            const max = tabMaxes[state.activeTab] ?? 0;
            actions.navigate(state.activeTab, -1, max);
            break;
          }
          case "down":
          case "j": {
            const tabMaxes: Record<string, number> = {
              services: state.liveData.lb.data.length,
              endpoints: state.liveData.ep.data.length,
              conntrack: state.liveData.ct.data.length,
              routes: state.liveData.routes.data.length,
              cluster: state.liveData.cluster.data.length,
              trace: state.liveData.trace.data.length,
              ports: state.liveData.ports.data.length,
              firewall: state.liveData.firewall.data.length,
              bgp: state.liveData.bgpNeighbors.data.length,
              "bgp-policy": state.liveData.bgpPolicy.data.length,
              bfd: state.liveData.bfd.data.length,
              vlan: state.liveData.vlans.data.length,
              vxlan: state.liveData.vxlans.data.length,
              session: state.liveData.sessions.data.length,
              policy: state.liveData.policies.data.length,
              mirror: state.liveData.mirrors.data.length,
              ipv4addr: state.liveData.ipv4addrs.data.length,
              neighbor: state.liveData.neighbors.data.length,
              fdb: state.liveData.fdb.data.length,
              ipfilter: state.liveData.ipfilter.data.length,
              secrate: state.liveData.secrate.data.length,
              sni: state.liveData.sni.data.length,
              cors: state.liveData.cors.data.length,
              "ipsec-tunnels": state.liveData.ipsecTunnels.data.length,
              "ipsec-sas": state.liveData.ipsecSAs.data.length,
              "ipsec-certs": state.liveData.ipsecCerts.data.length,
              "trace-parsers": state.liveData.traceParsers.data.length,
            };
            const max = tabMaxes[state.activeTab] ?? 0;
            actions.navigate(state.activeTab, 1, max);
            break;
          }
          case "g":
            // Ctrl+G for AI sidebar (avoid 'a' conflict with terminal)
            if (key.ctrl) {
              actions.toggleAi();
              getAuditLogger().log({
                event: "tui.action",
                component: "tui",
                data: { action: state.aiOpen ? "ai_sidebar_close" : "ai_sidebar_open" },
              });
            }
            break;
          case "r":
            // Ctrl+R for refresh (avoid single letter conflict)
            if (key.ctrl) {
              void actions.refresh();
            }
            break;
          case "n":
            if (state.activeTab === "services") {
              setModal("create-lb");
              getAuditLogger().log({
                event: "tui.action",
                component: "tui",
                data: { action: "form_create_lb" },
              });
            } else if (state.activeTab === "routes") {
              setModal("create-route");
              getAuditLogger().log({
                event: "tui.action",
                component: "tui",
                data: { action: "form_create_route" },
              });
            }
            break;
          case "d":
            if (state.activeTab === "services") {
              const svc = state.liveData.lb.data[state.selectedIndex.services ?? 0];
              if (svc) {
                const sa = svc.serviceArguments;
                setDeleteTarget({
                  title: "Delete LB Service",
                  message: `Delete ${sa.externalIP}:${sa.port}/${sa.protocol}?`,
                  onConfirm: async () => {
                    await state.api.lb.delete({
                      externalIP: sa.externalIP,
                      port: sa.port,
                      protocol: sa.protocol,
                    });
                    void actions.refresh();
                    setModal(null);
                  },
                });
                setModal("delete-confirm");
                getAuditLogger().log({
                  event: "tui.action",
                  component: "tui",
                  data: { action: "delete_confirm", detail: `lb:${sa.externalIP}:${sa.port}` },
                });
              }
            } else if (state.activeTab === "routes") {
              const route = state.liveData.routes.data[state.selectedIndex.routes ?? 0];
              if (route) {
                setDeleteTarget({
                  title: "Delete Route",
                  message: `Delete route ${route.destinationIPNet}?`,
                  onConfirm: async () => {
                    await state.api.route.delete({ destinationIPNet: route.destinationIPNet });
                    void actions.refresh();
                    setModal(null);
                  },
                });
                setModal("delete-confirm");
                getAuditLogger().log({
                  event: "tui.action",
                  component: "tui",
                  data: { action: "delete_confirm", detail: `route:${route.destinationIPNet}` },
                });
              }
            }
            break;
          case "return":
            if (state.activeTab === "trace") {
              const trList = state.liveData.trace.data;
              const trIdx = state.selectedIndex.trace ?? 0;
              const tr = trList[trIdx];
              if (tr !== undefined) {
                // Row 0 = HTTP trace (traceEnable), Row 1 = L4 trace (l4TraceEnable)
                const isEnabled = trIdx === 0 ? tr.traceEnable : tr.l4TraceEnable;
                const fn = isEnabled ? state.api.trace.disable : state.api.trace.enable;
                void fn.call(state.api.trace, trIdx).then(() => actions.refresh());
              }
            }
            break;
        }
      },
      [modal, state, actions, searchVisible, onQuit]
    )
  );

  const lastUpdated = Math.max(
    state.liveData.lb.lastUpdated,
    state.liveData.ep.lastUpdated,
    state.liveData.status.lastUpdated
  );

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: colors.bg.primary,
      }}
    >
      <Header
        host={state.config.loxilb.host}
        port={state.config.loxilb.port}
        tls={state.config.loxilb.tls}
        activeTab={state.activeTab}
        lastUpdated={lastUpdated}
        auth={state.authState}
      />

      <TabBar activeTab={state.activeTab} onSelect={actions.setTab} />

      {/* Content area: panels + AI sidebar side-by-side */}
      <box
        style={{
          width: "100%",
          height: contentH,
          flexDirection: "row",
        }}
      >
        {/* Main panel area */}
        <box
          style={{
            width: state.aiOpen ? panelW : "100%",
            height: contentH,
            flexDirection: "column",
          }}
        >
          {state.activeTab === "dashboard" && <DashboardPanel height={contentH} />}
          {state.activeTab === "services" && (
            <LBPanel
              height={contentH}
              searchVisible={searchVisible.services ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, services: false }))}
            />
          )}
          {state.activeTab === "endpoints" && (
            <EndpointPanel
              height={contentH}
              searchVisible={searchVisible.endpoints ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, endpoints: false }))}
            />
          )}
          {state.activeTab === "conntrack" && (
            <ConntrackPanel
              height={contentH}
              searchVisible={searchVisible.conntrack ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, conntrack: false }))}
            />
          )}
          {state.activeTab === "routes" && (
            <RoutePanel
              height={contentH}
              searchVisible={searchVisible.routes ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, routes: false }))}
            />
          )}
          {state.activeTab === "cluster" && (
            <ClusterPanel
              height={contentH}
              searchVisible={searchVisible.cluster ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, cluster: false }))}
            />
          )}
          {state.activeTab === "trace" && (
            <TracePanel
              height={contentH}
              searchVisible={searchVisible.trace ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, trace: false }))}
            />
          )}
          {state.activeTab === "metrics" && (
            <MetricsPanel
              height={contentH}
              searchVisible={searchVisible.metrics ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, metrics: false }))}
            />
          )}
          {state.activeTab === "logs" && (
            <LogPanel
              height={contentH}
              searchVisible={searchVisible.logs ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, logs: false }))}
            />
          )}
          {state.activeTab === "ports" && (
            <PortsPanel
              height={contentH}
              searchVisible={searchVisible.ports ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, ports: false }))}
            />
          )}
          {state.activeTab === "firewall" && (
            <SecurityPanel
              height={contentH}
              searchVisible={searchVisible.firewall ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, firewall: false }))}
            />
          )}
          {/* BGP group */}
          {state.activeTab === "bgp" && (
            <BgpPanel
              height={contentH}
              searchVisible={searchVisible.bgp ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, bgp: false }))}
            />
          )}
          {state.activeTab === "bgp-policy" && (
            <BgpPolicyPanel
              height={contentH}
              searchVisible={searchVisible["bgp-policy"] ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, "bgp-policy": false }))}
            />
          )}
          {state.activeTab === "bfd" && (
            <BfdPanel
              height={contentH}
              searchVisible={searchVisible.bfd ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, bfd: false }))}
            />
          )}
          {/* L2 group */}
          {state.activeTab === "vlan" && (
            <VlanPanel
              height={contentH}
              searchVisible={searchVisible.vlan ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, vlan: false }))}
            />
          )}
          {state.activeTab === "vxlan" && (
            <VxlanPanel
              height={contentH}
              searchVisible={searchVisible.vxlan ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, vxlan: false }))}
            />
          )}
          {state.activeTab === "session" && (
            <SessionPanel
              height={contentH}
              searchVisible={searchVisible.session ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, session: false }))}
            />
          )}
          {state.activeTab === "policy" && (
            <PolicyPanel
              height={contentH}
              searchVisible={searchVisible.policy ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, policy: false }))}
            />
          )}
          {state.activeTab === "mirror" && (
            <MirrorPanel
              height={contentH}
              searchVisible={searchVisible.mirror ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, mirror: false }))}
            />
          )}
          {state.activeTab === "ipv4addr" && (
            <IPv4Panel
              height={contentH}
              searchVisible={searchVisible.ipv4addr ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, ipv4addr: false }))}
            />
          )}
          {state.activeTab === "neighbor" && (
            <NeighborPanel
              height={contentH}
              searchVisible={searchVisible.neighbor ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, neighbor: false }))}
            />
          )}
          {state.activeTab === "fdb" && (
            <FdbPanel
              height={contentH}
              searchVisible={searchVisible.fdb ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, fdb: false }))}
            />
          )}
          {/* SEC additions */}
          {state.activeTab === "ipfilter" && (
            <IPFilterPanel
              height={contentH}
              searchVisible={searchVisible.ipfilter ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, ipfilter: false }))}
            />
          )}
          {state.activeTab === "secrate" && (
            <SecurityRatePanel
              height={contentH}
              searchVisible={searchVisible.secrate ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, secrate: false }))}
            />
          )}
          {state.activeTab === "sni" && (
            <SNICertPanel
              height={contentH}
              searchVisible={searchVisible.sni ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, sni: false }))}
            />
          )}
          {state.activeTab === "cors" && (
            <CORSPanel
              height={contentH}
              searchVisible={searchVisible.cors ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, cors: false }))}
            />
          )}
          {/* IPSEC group */}
          {state.activeTab === "ipsec-tunnels" && (
            <IPsecTunnelPanel
              height={contentH}
              searchVisible={searchVisible["ipsec-tunnels"] ?? false}
              onSearchClose={() =>
                setSearchVisible((prev) => ({ ...prev, "ipsec-tunnels": false }))
              }
            />
          )}
          {state.activeTab === "ipsec-sas" && (
            <IPsecSAPanel
              height={contentH}
              searchVisible={searchVisible["ipsec-sas"] ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, "ipsec-sas": false }))}
            />
          )}
          {state.activeTab === "ipsec-stats" && <IPsecStatsPanel height={contentH} />}
          {state.activeTab === "ipsec-certs" && (
            <IPsecCertPanel
              height={contentH}
              searchVisible={searchVisible["ipsec-certs"] ?? false}
              onSearchClose={() => setSearchVisible((prev) => ({ ...prev, "ipsec-certs": false }))}
            />
          )}
          {/* AI group */}
          {state.activeTab === "gpu" && <GPUPanel height={contentH} />}
          {state.activeTab === "trace-parsers" && (
            <TraceParsersPanel
              height={contentH}
              searchVisible={searchVisible["trace-parsers"] ?? false}
              onSearchClose={() =>
                setSearchVisible((prev) => ({ ...prev, "trace-parsers": false }))
              }
            />
          )}
        </box>

        {/* Drag-to-resize divider — 2 cols wide for easier grab */}
        {state.aiOpen && (
          // biome-ignore lint/a11y/useKeyWithMouseEvents: terminal UI element (opentui <box>), not a DOM node — focus/blur semantics don't apply
          <box
            style={{
              width: 2,
              height: contentH,
              backgroundColor: dividerHovered ? colors.border.active : colors.border.normal,
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseOver={() => setDividerHovered(true)}
            onMouseOut={() => setDividerHovered(false)}
            onMouseDown={(e: MouseEvent) => {
              dragRef.current = { startX: e.x, startW: sidebarW };
            }}
            onMouseDrag={(e: MouseEvent) => {
              if (!dragRef.current) return;
              const newW = Math.max(
                MIN_SIDEBAR_W,
                Math.min(MAX_SIDEBAR_W, dragRef.current.startW - (e.x - dragRef.current.startX))
              );
              setUserSidebarW(newW);
            }}
            onMouseDragEnd={() => {
              dragRef.current = null;
            }}
          >
            <text fg={dividerHovered ? colors.fg.primary : colors.border.active}>{"┃"}</text>
          </box>
        )}

        {/* AI Sidebar */}
        <AiSidebar height={contentH} width={sidebarW} visible={state.aiOpen} />
      </box>

      <Footer statusMessage={state.statusMessage} />

      {/* Command Palette */}
      {modal === "command-palette" && (
        <CommandPalette
          onClose={() => setModal(null)}
          onResult={(msg, isError) => {
            setModal(null);
            actions.showStatusMessage(msg, 3000);
          }}
        />
      )}

      {/* Modals */}
      {modal === "create-lb" && (
        <CreateLbServiceForm
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            void actions.refresh();
          }}
        />
      )}
      {modal === "create-route" && (
        <CreateRouteForm
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            void actions.refresh();
          }}
        />
      )}
      {modal === "delete-confirm" && deleteTarget && (
        <DeleteConfirmDialog
          title={deleteTarget.title}
          message={deleteTarget.message}
          onConfirm={() => {
            void deleteTarget.onConfirm();
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </box>
  );
}
