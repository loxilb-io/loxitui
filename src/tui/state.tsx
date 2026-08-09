import { AuthSession, LoxilbApi } from "@/api";
import type { AuthState } from "@/api";
import { LoxilbApiClient } from "@/api/client";
import type {
  BfdGetEntry,
  BgpNeighEntry,
  BgpPolicyDefinition,
  CiStateEntry,
  ConnAttr,
  CorsEntry,
  DeviceInfoEntry,
  EndPointGetEntry,
  FDBEntry,
  FileSystemInfoEntry,
  FirewallEntry,
  GPUMonitoringStatus,
  IPFilterEntry,
  IPsecCertificate,
  IPsecSA,
  IPsecStats,
  IPsecTunnel,
  IPv4AddressGetEntry,
  LbServiceArg,
  MirrorGetEntry,
  NeighborEntry,
  PolicyEntry,
  PortEntry,
  ProcessStatus,
  RouteEntry,
  SNICertificateEntry,
  SecurityRateEntry,
  SessionEntry,
  TraceCatalogEntry,
  TraceParserInfo,
  TraceStatus,
  VersionEntry,
  VlanGetEntry,
  VxlanBridgeEntry,
} from "@/api/models";
import type { ValidatedConfig } from "@/config";
import { MetricPoller } from "@/metrics/poller";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TabGroup, TabId } from "./theme";
import { TABS, TAB_GROUPS } from "./theme";

export interface AiMessage {
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  /** Name of the MCP tool (for tool_use / tool_result messages) */
  toolName?: string;
  /** Agent skill that was active when this assistant message was generated */
  skillName?: string;
  /** Unix timestamp (ms) when this message was created */
  ts?: number;
}

interface DataSlice<T> {
  loading: boolean;
  error: string | null;
  data: T[];
  lastUpdated: number;
}

function emptySlice<T>(): DataSlice<T> {
  return { loading: false, error: null, data: [], lastUpdated: 0 };
}

export interface LiveData {
  lb: DataSlice<LbServiceArg>;
  ep: DataSlice<EndPointGetEntry>;
  ct: DataSlice<ConnAttr>;
  cluster: DataSlice<CiStateEntry>;
  routes: DataSlice<RouteEntry>;
  status: DataSlice<ProcessStatus>;
  trace: DataSlice<TraceStatus>;
  ports: DataSlice<PortEntry>;
  firewall: DataSlice<FirewallEntry>;
  filesystem: DataSlice<FileSystemInfoEntry>;
  device: { loading: boolean; error: string | null; data: DeviceInfoEntry | null };
  version: { loading: boolean; error: string | null; data: VersionEntry | null };
  // BGP group
  bgpNeighbors: DataSlice<BgpNeighEntry>;
  bgpPolicy: DataSlice<BgpPolicyDefinition>;
  bfd: DataSlice<BfdGetEntry>;
  // L2 group
  vlans: DataSlice<VlanGetEntry>;
  vxlans: DataSlice<VxlanBridgeEntry>;
  sessions: DataSlice<SessionEntry>;
  policies: DataSlice<PolicyEntry>;
  mirrors: DataSlice<MirrorGetEntry>;
  ipv4addrs: DataSlice<IPv4AddressGetEntry>;
  neighbors: DataSlice<NeighborEntry>;
  fdb: DataSlice<FDBEntry>;
  // SEC additions
  ipfilter: DataSlice<IPFilterEntry>;
  secrate: DataSlice<SecurityRateEntry>;
  sni: DataSlice<SNICertificateEntry>;
  cors: DataSlice<CorsEntry>;
  // IPSEC group
  ipsecTunnels: DataSlice<IPsecTunnel>;
  ipsecSAs: DataSlice<IPsecSA>;
  ipsecStats: DataSlice<IPsecStats>;
  ipsecCerts: DataSlice<IPsecCertificate>;
  // AI group
  gpuStatus: DataSlice<GPUMonitoringStatus>;
  traceParsers: DataSlice<TraceParserInfo>;
  traceCatalogs: DataSlice<TraceCatalogEntry>;
}

export interface AppState {
  activeTab: TabId;
  aiOpen: boolean;
  aiMessages: AiMessage[];
  aiStreaming: boolean;
  aiInput: string;
  pendingLogAnalysis: string | null;
  statusMessage: string | null;
  liveData: LiveData;
  selectedIndex: Record<TabId, number>;
  searchQuery: Record<TabId, string>; // Search query per panel
  config: ValidatedConfig;
  api: LoxilbApi;
  authState: AuthState;
  tickCount: number; // increments on each poll cycle
  metricsPoller: MetricPoller;
  metricsTick: number; // increments on each metrics poll for re-render
}

interface AppActions {
  setTab: (tab: TabId) => void;
  nextTab: () => void;
  prevTab: () => void;
  nextGroup: () => void;
  prevGroup: () => void;
  toggleAi: () => void;
  setAiOpen: (open: boolean) => void;
  setAiInput: (input: string) => void;
  pushAiMessage: (msg: AiMessage) => void;
  replaceAiMessages: (msgs: AiMessage[]) => void;
  setAiStreaming: (v: boolean) => void;
  updateAiLastMessage: (chunk: string) => void;
  navigate: (tab: TabId, delta: number, max: number) => void;
  refresh: () => void;
  setPendingLogAnalysis: (ctx: string | null) => void;
  showStatusMessage: (msg: string, durationMs?: number) => void;
  setSearchQuery: (tab: TabId, query: string) => void;
  setLbData: (data: LbServiceArg[]) => void;
  setEpData: (data: EndPointGetEntry[]) => void;
  setCtData: (data: ConnAttr[]) => void;
  setClusterData: (data: CiStateEntry[]) => void;
  setRoutesData: (data: RouteEntry[]) => void;
  setStatusData: (data: ProcessStatus[]) => void;
  setTraceData: (data: TraceStatus[]) => void;
}

interface AppCtx {
  state: AppState;
  actions: AppActions;
}

const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({
  config,
  children,
}: { config: ValidatedConfig; children: ReactNode }): ReactNode {
  const api = useRef(
    new LoxilbApi({
      host: config.loxilb.host,
      port: config.loxilb.port,
      tls: config.loxilb.tls,
      token: config.loxilb.token,
      username: config.loxilb.username,
      password: config.loxilb.password,
    })
  ).current;

  const authSession = useRef(
    new AuthSession(api.raw, {
      token: config.loxilb.token,
      username: config.loxilb.username,
      password: config.loxilb.password,
    })
  ).current;
  const [authState, setAuthState] = useState<AuthState>(authSession.getState());

  const metricsClient = useRef(
    new LoxilbApiClient({
      host: config.loxilb.host,
      port: config.loxilb.port,
      tls: config.loxilb.tls,
      token: config.loxilb.token,
    })
  ).current;

  const metricsPoller = useRef(
    new MetricPoller(metricsClient, {
      path: "/metrics",
      interval: (config.metrics?.poll_interval_s ?? 30) * 1000,
    })
  ).current;

  const [metricsTick, setMetricsTick] = useState(0);

  // Start/stop MetricPoller lifecycle
  useEffect(() => {
    metricsPoller.start();
    const intervalMs = (config.metrics?.poll_interval_s ?? 30) * 1000;
    const t = setInterval(() => setMetricsTick((n) => n + 1), intervalMs);
    return () => {
      metricsPoller.stop();
      clearInterval(t);
    };
  }, [metricsPoller, config.metrics?.poll_interval_s]);

  const defaultIndexes = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<TabId, number>;
  const defaultSearchQueries = Object.fromEntries(TABS.map((t) => [t.id, ""])) as Record<
    TabId,
    string
  >;

  const [activeTab, setActiveTabState] = useState<TabId>("dashboard");
  const [aiOpen, setAiOpenState] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiStreaming, setAiStreamingState] = useState(false);
  const [aiInput, setAiInputState] = useState("");
  const [pendingLogAnalysis, setPendingLogAnalysisState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<Record<TabId, number>>(defaultIndexes);
  const [searchQuery, setSearchQueryState] = useState<Record<TabId, string>>(defaultSearchQueries);
  const [tickCount, setTickCount] = useState(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [liveData, setLiveData] = useState<LiveData>({
    lb: emptySlice(),
    ep: emptySlice(),
    ct: emptySlice(),
    cluster: emptySlice(),
    routes: emptySlice(),
    status: emptySlice(),
    trace: emptySlice(),
    ports: emptySlice(),
    firewall: emptySlice(),
    filesystem: emptySlice(),
    device: { loading: false, error: null, data: null },
    version: { loading: false, error: null, data: null },
    // BGP group
    bgpNeighbors: emptySlice(),
    bgpPolicy: emptySlice(),
    bfd: emptySlice(),
    // L2 group
    vlans: emptySlice(),
    vxlans: emptySlice(),
    sessions: emptySlice(),
    policies: emptySlice(),
    mirrors: emptySlice(),
    ipv4addrs: emptySlice(),
    neighbors: emptySlice(),
    fdb: emptySlice(),
    // SEC additions
    ipfilter: emptySlice(),
    secrate: emptySlice(),
    sni: emptySlice(),
    cors: emptySlice(),
    // IPSEC group
    ipsecTunnels: emptySlice(),
    ipsecSAs: emptySlice(),
    ipsecStats: emptySlice(),
    ipsecCerts: emptySlice(),
    // AI group
    gpuStatus: emptySlice(),
    traceParsers: emptySlice(),
    traceCatalogs: emptySlice(),
  });

  // Polling
  const poll = useCallback(async () => {
    // In jwt mode this logs in on first poll and refreshes before expiry;
    // static-token / none modes return immediately.
    const auth = await authSession.ensureFresh();
    setAuthState((prev) =>
      prev.mode === auth.mode && prev.expiresAt === auth.expiresAt && prev.error === auth.error
        ? prev
        : auth
    );
    const now = Date.now();
    const [
      lbR,
      epR,
      ctR,
      clR,
      roR,
      stR,
      trR,
      poR,
      fwR,
      fsR,
      devR,
      verR,
      bgpNeighR,
      bgpPolR,
      bfdR,
      vlanR,
      vxlanR,
      sessR,
      polR,
      mirR,
      ipv4R,
      neighR,
      fdbR,
      ipfiltR,
      secrateR,
      sniR,
      corsR,
      ipsecTunR,
      ipsecSaR,
      ipsecStatsR,
      ipsecCertR,
      gpuR,
      parsersR,
      catalogsR,
    ] = await Promise.all([
      api.lb.list(),
      api.ep.list(),
      api.ct.list(),
      api.cluster.list(),
      api.route.list(),
      api.status.processes(),
      api.trace.list(),
      api.ports.list(),
      api.security.listFirewall(),
      api.status.filesystem(),
      api.status.device(),
      api.status.version(),
      // BGP group
      api.bgp.listNeighbors(),
      api.bgp.listPolicyDefinitions(),
      api.bfd.list(),
      // L2 group
      api.network.listVlans(),
      api.network.listVxlans(),
      api.network.listSessions(),
      api.network.listPolicies(),
      api.network.listMirrors(),
      api.network.listIPv4Addresses(),
      api.network.listNeighbors(),
      api.network.listFdb(),
      // SEC additions
      api.security.listIPFilter(),
      api.security.listSecurityRate(),
      api.security.listSNICertificates(),
      api.security.listCORS(),
      // IPSEC group
      api.ipsec.listTunnels(),
      api.ipsec.listSAs(),
      api.ipsec.getStats(),
      api.ipsec.listCertificates(),
      // AI group
      api.aiGateway.getGPUStatus(),
      api.aiGateway.listTraceParsers(),
      api.aiGateway.listTraceCatalogs(),
    ]);

    setLiveData((prev) => ({
      lb: lbR.ok
        ? { loading: false, error: null, data: lbR.data, lastUpdated: now }
        : { ...prev.lb, loading: false, error: lbR.error.message },
      ep: epR.ok
        ? { loading: false, error: null, data: epR.data, lastUpdated: now }
        : { ...prev.ep, loading: false, error: epR.error.message },
      ct: ctR.ok
        ? { loading: false, error: null, data: ctR.data, lastUpdated: now }
        : { ...prev.ct, loading: false, error: ctR.error.message },
      cluster: clR.ok
        ? { loading: false, error: null, data: clR.data, lastUpdated: now }
        : { ...prev.cluster, loading: false, error: clR.error.message },
      routes: roR.ok
        ? { loading: false, error: null, data: roR.data, lastUpdated: now }
        : { ...prev.routes, loading: false, error: roR.error.message },
      status: stR.ok
        ? { loading: false, error: null, data: stR.data, lastUpdated: now }
        : { ...prev.status, loading: false, error: stR.error.message },
      trace: trR.ok
        ? { loading: false, error: null, data: trR.data, lastUpdated: now }
        : { ...prev.trace, loading: false, error: trR.error.message },
      ports: poR.ok
        ? { loading: false, error: null, data: poR.data, lastUpdated: now }
        : { ...prev.ports, loading: false, error: poR.error.message },
      firewall: fwR.ok
        ? { loading: false, error: null, data: fwR.data, lastUpdated: now }
        : { ...prev.firewall, loading: false, error: fwR.error.message },
      filesystem: fsR.ok
        ? { loading: false, error: null, data: fsR.data, lastUpdated: now }
        : { ...prev.filesystem, loading: false, error: fsR.error.message },
      device: devR.ok
        ? { loading: false, error: null, data: devR.data }
        : { loading: false, error: devR.error.message, data: prev.device.data },
      version: verR.ok
        ? { loading: false, error: null, data: verR.data }
        : { loading: false, error: verR.error.message, data: prev.version.data },
      // BGP group
      bgpNeighbors: bgpNeighR.ok
        ? { loading: false, error: null, data: bgpNeighR.data, lastUpdated: now }
        : { ...prev.bgpNeighbors, loading: false, error: bgpNeighR.error.message },
      bgpPolicy: bgpPolR.ok
        ? { loading: false, error: null, data: bgpPolR.data, lastUpdated: now }
        : { ...prev.bgpPolicy, loading: false, error: bgpPolR.error.message },
      bfd: bfdR.ok
        ? { loading: false, error: null, data: bfdR.data, lastUpdated: now }
        : { ...prev.bfd, loading: false, error: bfdR.error.message },
      // L2 group
      vlans: vlanR.ok
        ? { loading: false, error: null, data: vlanR.data, lastUpdated: now }
        : { ...prev.vlans, loading: false, error: vlanR.error.message },
      vxlans: vxlanR.ok
        ? { loading: false, error: null, data: vxlanR.data, lastUpdated: now }
        : { ...prev.vxlans, loading: false, error: vxlanR.error.message },
      sessions: sessR.ok
        ? { loading: false, error: null, data: sessR.data, lastUpdated: now }
        : { ...prev.sessions, loading: false, error: sessR.error.message },
      policies: polR.ok
        ? { loading: false, error: null, data: polR.data, lastUpdated: now }
        : { ...prev.policies, loading: false, error: polR.error.message },
      mirrors: mirR.ok
        ? { loading: false, error: null, data: mirR.data, lastUpdated: now }
        : { ...prev.mirrors, loading: false, error: mirR.error.message },
      ipv4addrs: ipv4R.ok
        ? { loading: false, error: null, data: ipv4R.data, lastUpdated: now }
        : { ...prev.ipv4addrs, loading: false, error: ipv4R.error.message },
      neighbors: neighR.ok
        ? { loading: false, error: null, data: neighR.data, lastUpdated: now }
        : { ...prev.neighbors, loading: false, error: neighR.error.message },
      fdb: fdbR.ok
        ? { loading: false, error: null, data: fdbR.data, lastUpdated: now }
        : { ...prev.fdb, loading: false, error: fdbR.error.message },
      // SEC additions
      ipfilter: ipfiltR.ok
        ? { loading: false, error: null, data: ipfiltR.data, lastUpdated: now }
        : { ...prev.ipfilter, loading: false, error: ipfiltR.error.message },
      secrate: secrateR.ok
        ? { loading: false, error: null, data: secrateR.data, lastUpdated: now }
        : { ...prev.secrate, loading: false, error: secrateR.error.message },
      sni: sniR.ok
        ? { loading: false, error: null, data: sniR.data, lastUpdated: now }
        : { ...prev.sni, loading: false, error: sniR.error.message },
      cors: corsR.ok
        ? { loading: false, error: null, data: corsR.data, lastUpdated: now }
        : { ...prev.cors, loading: false, error: corsR.error.message },
      // IPSEC group
      ipsecTunnels: ipsecTunR.ok
        ? { loading: false, error: null, data: ipsecTunR.data, lastUpdated: now }
        : { ...prev.ipsecTunnels, loading: false, error: ipsecTunR.error.message },
      ipsecSAs: ipsecSaR.ok
        ? { loading: false, error: null, data: ipsecSaR.data, lastUpdated: now }
        : { ...prev.ipsecSAs, loading: false, error: ipsecSaR.error.message },
      ipsecStats: ipsecStatsR.ok
        ? {
            loading: false,
            error: null,
            data: ipsecStatsR.data ? [ipsecStatsR.data] : [],
            lastUpdated: now,
          }
        : { ...prev.ipsecStats, loading: false, error: ipsecStatsR.error.message },
      ipsecCerts: ipsecCertR.ok
        ? { loading: false, error: null, data: ipsecCertR.data, lastUpdated: now }
        : { ...prev.ipsecCerts, loading: false, error: ipsecCertR.error.message },
      // AI group
      gpuStatus: gpuR.ok
        ? { loading: false, error: null, data: gpuR.data ? [gpuR.data] : [], lastUpdated: now }
        : { ...prev.gpuStatus, loading: false, error: gpuR.error.message },
      traceParsers: parsersR.ok
        ? { loading: false, error: null, data: parsersR.data, lastUpdated: now }
        : { ...prev.traceParsers, loading: false, error: parsersR.error.message },
      traceCatalogs: catalogsR.ok
        ? { loading: false, error: null, data: catalogsR.data, lastUpdated: now }
        : { ...prev.traceCatalogs, loading: false, error: catalogsR.error.message },
    }));
    setTickCount((n) => n + 1);
  }, [api, authSession]);

  useEffect(() => {
    poll();
    const intervalMs = (config.metrics?.poll_interval_s ?? 5) * 1000;
    const t = setInterval(poll, intervalMs);
    return () => clearInterval(t);
  }, [poll, config.metrics?.poll_interval_s]);

  const setTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    // Clear search query when switching tabs
    setSearchQueryState((prev) => ({ ...prev, [tab]: "" }));
  }, []);

  const nextTab = useCallback(() => {
    setActiveTabState((cur) => {
      const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
      const idx = allTabs.findIndex((t) => t.id === cur);
      if (idx < 0) return cur;
      return allTabs[(idx + 1) % allTabs.length]!.id;
    });
  }, []);

  const prevTab = useCallback(() => {
    setActiveTabState((cur) => {
      const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
      const idx = allTabs.findIndex((t) => t.id === cur);
      if (idx < 0) return cur;
      return allTabs[(idx - 1 + allTabs.length) % allTabs.length]!.id;
    });
  }, []);

  const nextGroup = useCallback(() => {
    setActiveTabState((cur) => {
      const groupIdx = TAB_GROUPS.findIndex((g) => g.tabs.some((t) => t.id === cur));
      if (groupIdx < 0) return cur;
      const next = TAB_GROUPS[(groupIdx + 1) % TAB_GROUPS.length]!;
      return next.tabs[0]!.id;
    });
  }, []);

  const prevGroup = useCallback(() => {
    setActiveTabState((cur) => {
      const groupIdx = TAB_GROUPS.findIndex((g) => g.tabs.some((t) => t.id === cur));
      if (groupIdx < 0) return cur;
      const prev = TAB_GROUPS[(groupIdx - 1 + TAB_GROUPS.length) % TAB_GROUPS.length]!;
      return prev.tabs[0]!.id;
    });
  }, []);

  const navigate = useCallback((tab: TabId, delta: number, max: number) => {
    setSelectedIndex((prev) => ({
      ...prev,
      [tab]: Math.max(0, Math.min(max - 1, (prev[tab] ?? 0) + delta)),
    }));
  }, []);

  const pushAiMessage = useCallback(
    (msg: AiMessage) => {
      // Cap history to prevent unbounded memory growth; each turn = 2 entries (user + assistant)
      const maxEntries = config.ai.max_history_turns * 2;
      const msgWithTs: AiMessage = { ...msg, ts: msg.ts ?? Date.now() };
      setAiMessages((prev) => {
        const next = [...prev, msgWithTs];
        return next.length > maxEntries ? next.slice(-maxEntries) : next;
      });
    },
    [config.ai.max_history_turns]
  );

  const replaceAiMessages = useCallback((msgs: AiMessage[]) => {
    setAiMessages(msgs);
  }, []);

  const updateAiLastMessage = useCallback((chunk: string) => {
    setAiMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
    });
  }, []);

  const showStatusMessage = useCallback((msg: string, durationMs = 3000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), durationMs);
  }, []);

  const setSearchQuery = useCallback((tab: TabId, query: string) => {
    setSearchQueryState((prev) => ({ ...prev, [tab]: query }));
    // Reset selectedIndex to 0 when search query changes (predictable UX)
    setSelectedIndex((prev) => ({ ...prev, [tab]: 0 }));
  }, []);

  const actions: AppActions = {
    setTab,
    nextTab,
    prevTab,
    nextGroup,
    prevGroup,
    toggleAi: useCallback(() => setAiOpenState((p) => !p), []),
    setAiOpen: setAiOpenState,
    setAiInput: setAiInputState,
    pushAiMessage,
    replaceAiMessages,
    setAiStreaming: setAiStreamingState,
    updateAiLastMessage,
    navigate,
    refresh: poll,
    setPendingLogAnalysis: setPendingLogAnalysisState,
    showStatusMessage,
    setSearchQuery,
    setLbData: (data) =>
      setLiveData((p) => ({
        ...p,
        lb: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setEpData: (data) =>
      setLiveData((p) => ({
        ...p,
        ep: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setCtData: (data) =>
      setLiveData((p) => ({
        ...p,
        ct: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setClusterData: (data) =>
      setLiveData((p) => ({
        ...p,
        cluster: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setRoutesData: (data) =>
      setLiveData((p) => ({
        ...p,
        routes: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setStatusData: (data) =>
      setLiveData((p) => ({
        ...p,
        status: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
    setTraceData: (data) =>
      setLiveData((p) => ({
        ...p,
        trace: { loading: false, error: null, data, lastUpdated: Date.now() },
      })),
  };

  const state: AppState = {
    activeTab,
    aiOpen,
    aiMessages,
    aiStreaming,
    aiInput,
    pendingLogAnalysis,
    statusMessage,
    liveData,
    selectedIndex,
    searchQuery,
    config,
    api,
    authState,
    tickCount,
    metricsPoller,
    metricsTick,
  };

  return <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>;
}
