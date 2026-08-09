// TypeScript models derived from api/swagger.yml
// Field names match the LoxiLB REST API Go JSON tags exactly.

// ─── Load Balancer ──────────────────────────────────────────────────────────

export interface LbServiceArg {
  serviceArguments: LbService;
  secondaryIPs?: SecondaryIP[];
  endpoints: LbEndPoint[];
}

export interface LbService {
  externalIP: string; // swagger: externalIP → Go JSON tag: json:"externalIP" (common.go:803)
  privateIP?: string;
  port: number; // swagger: port → Go JSON tag: json:"port" (common.go:807)
  portMax?: number;
  protocol: "tcp" | "udp" | "sctp" | "icmp" | "none" | "http" | "https" | "quic";
  name: string;

  // NAT mode (distinct from sel)
  // 0=DNAT, 1=OneArm, 2=FullNAT, 3=DSR, 4=FullProxy, 5=HostOneArm, 6=AIGW
  mode?: number;
  // LB selection algorithm (distinct from mode)
  // 0=RR, 1=Hash, 2=WRR, 3=Persist, 4=LC, 5=N2, 6=N3, 7=QUIC, 8=CHWBL, 9=GPUAware, 10=WRRHash
  sel?: number;

  monitor?: boolean;
  probetype?: string;
  probeport?: number;
  probereq?: string;
  proberesp?: string;
  probeTimeout?: number;
  probeRetries?: number;

  inactiveTimeout?: number;
  persistTimeout?: number;
  session_header_name?: string;

  bgp?: boolean;
  snat?: boolean;
  lbsec?: number;
  egress?: boolean;
  managed?: boolean;
  proxyprotocolv2?: boolean;
  backend_protocol?: string;

  path?: string;
  path_prefix?: string;
  path_match_mode?: string;

  model_name?: string;
  sse_mode?: boolean;
  max_stream_duration_sec?: number;
  backend_keepalive_interval_sec?: number;
  pd_disagg_mode?: boolean;
  llm_type?: string;
  trace_type?: string;

  chwbl_prefix_hash_level?: number;
  chwbl_prefix_hash_flags?: number;
  chwbl_mean_load_factor?: number;
  chwbl_replication?: number;
  chwbl_enable_cache_salt?: boolean;

  secIPs?: SecondaryIP[];
  block?: number;
}

export interface LbEndPoint {
  endpointIP: string;
  targetPort: number;
  weight: number;
  state?: "active" | "inactive" | "softstop";
  counter?: string;
  noResolve?: boolean;
  ep_role?: number;
  nixl_port?: number;
}

export interface SecondaryIP {
  secondaryExternalIp: string;
}

export interface LbServiceList {
  lbAttr: LbServiceArg[];
}

// ─── Endpoint ───────────────────────────────────────────────────────────────

// EndPointMod: used for POST/DELETE operations
export interface EndPointMod {
  epIP: string;
  epPort: number;
  epProto?: string;
  epMark?: number;
  httpEP?: boolean;
  inActiveEP?: boolean;
  noEndPointsEP?: boolean;
  epHardStop?: boolean;
  epProbeType?: string;
  epProbePort?: number;
  epProbeReq?: string;
  epProbeResp?: string;
  epProbeReqURL?: string;
  epProbeRespCode?: number;
  noEpCnt?: number;
  epActChk?: number;
  epDelay?: number;
}

// EndPointGetEntry: returned by GET /config/endpoint/all
// swagger: EndPointGetEntry → Go JSON tags: end_point_get_entry.go
export interface EndPointGetEntry {
  hostName?: string; // swagger: hostName → Go JSON tag: json:"hostName"
  name?: string; // swagger: name → Go JSON tag: json:"name"
  currState?: string; // swagger: currState → Go JSON tag: json:"currState"
  probeType?: string; // swagger: probeType → Go JSON tag: json:"probeType"
  probeDuration?: number; // swagger: probeDuration → Go JSON tag: json:"probeDuration"
  probePort?: number; // swagger: probePort → Go JSON tag: json:"probePort"
  probeReq?: string; // swagger: probeReq → Go JSON tag: json:"probeReq"
  probeResp?: string; // swagger: probeResp → Go JSON tag: json:"probeResp"
  inactiveReTries?: number; // swagger: inactiveReTries → Go JSON tag: json:"inactiveReTries"
  avgDelay?: string; // swagger: avgDelay → Go JSON tag: json:"avgDelay"
  minDelay?: string; // swagger: minDelay → Go JSON tag: json:"minDelay"
  maxDelay?: string; // swagger: maxDelay → Go JSON tag: json:"maxDelay"
}

export interface EndPointList {
  Attr: EndPointGetEntry[]; // swagger: Attr → Go JSON tag: json:"Attr" (get_config_endpoint_all.go:86)
}

// ─── Connection Tracking ─────────────────────────────────────────────────────

export interface ConnAttr {
  sourceIP: string;
  destinationIP: string;
  sourcePort: number;
  destinationPort: number;
  protocol: string;
  conntrackState?: string; // swagger: conntrackState → Go JSON tag: json:"conntrackState" (conntrack_entry.go:27)
  conntrackAct?: string; // swagger: conntrackAct → Go JSON tag: json:"conntrackAct" (conntrack_entry.go:24)
}

export interface ConntrackList {
  ctAttr: ConnAttr[];
}

// ─── Cluster / HA ────────────────────────────────────────────────────────────

export interface CiStateEntry {
  instance: string;
  state: string;
  vip?: string;
  sync?: number; // swagger: sync → Go JSON tag: json:"sync" (c_i_status_get_entry.go:30)
}

export interface CiStateList {
  Attr: CiStateEntry[]; // swagger: Attr → Go JSON tag: json:"Attr" (get_config_cistate_all.go:86)
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export interface RouteEntry {
  destinationIPNet: string; // swagger: destinationIPNet → Go JSON tag: json:"destinationIPNet" (route_get_entry.go:23)
  gateway?: string; // swagger: gateway → Go JSON tag: json:"gateway" (route_get_entry.go:29)
  ifname?: string;
  protocol?: number;
}

// ─── Process Status ──────────────────────────────────────────────────────────

// ProcessInfoEntry: returned by GET /status/process
// swagger: ProcessInfoEntry → Go JSON tags: process_info_entry.go
export interface ProcessStatus {
  pid?: string; // swagger: pid → Go JSON tag: json:"pid"
  user?: string; // swagger: user → Go JSON tag: json:"user"
  command?: string; // swagger: command → Go JSON tag: json:"command"
  status?: string; // swagger: status → Go JSON tag: json:"status"
  CPUUsage?: string; // swagger: CPUUsage → Go JSON tag: json:"CPUUsage"
  MemoryUsage?: string; // swagger: MemoryUsage → Go JSON tag: json:"MemoryUsage"
  time?: string; // swagger: time → Go JSON tag: json:"time"
  nice?: string; // swagger: nice → Go JSON tag: json:"nice"
  priority?: string; // swagger: priority → Go JSON tag: json:"priority"
  residentSize?: string; // swagger: residentSize → Go JSON tag: json:"residentSize"
  sharedMemory?: string; // swagger: sharedMemory → Go JSON tag: json:"sharedMemory"
  virtMemory?: string; // swagger: virtMemory → Go JSON tag: json:"virtMemory"
}

// ─── Trace ───────────────────────────────────────────────────────────────────

export interface TraceStatus {
  traceEnable?: boolean;
  l4TraceEnable?: boolean;
  traceProto?: string;
  /** Row label populated by TraceApi.list(): "HTTP" | "L4" */
  label?: string;
}

// ─── Ports ──────────────────────────────────────────────────────────────────

export interface PortSoftwareInfo {
  osId?: string;
  portType?: string;
  portProp?: string;
  portActive?: boolean;
  bpfLoaded?: boolean;
}

export interface PortHardwareInfo {
  rawMacAddress?: number[];
  macAddress?: string;
  mtu?: number;
  link?: boolean; // Go: bool — true = link up, false = link down (was incorrectly typed as string)
  state?: string;
  master?: string;
  real?: string;
  tunnelId?: number;
}

export interface PortStatisticInfo {
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
}

export interface PortL3Info {
  routed?: boolean;
  IPv4Address?: string[];
  IPv6Address?: string[];
}

export interface PortEntry {
  portName?: string;
  portNo?: number;
  zone?: string;
  portSoftwareInformation?: PortSoftwareInfo;
  portHardwareInformation?: PortHardwareInfo;
  portStatisticInformation?: PortStatisticInfo;
  portL3Information?: PortL3Info;
  portL2Information?: Record<string, unknown>;
}

// ─── Firewall / Security ────────────────────────────────────────────────────

export interface FirewallRuleEntry {
  sourceIP?: string;
  destinationIP?: string;
  minSourcePort?: number;
  maxSourcePort?: number;
  minDestinationPort?: number;
  maxDestinationPort?: number;
  protocol?: number;
  portName?: string;
  preference?: number;
}

export interface FirewallOptionEntry {
  drop?: boolean;
  trap?: boolean;
  redirect?: boolean;
  allow?: boolean;
  record?: boolean;
  redirectPortName?: string;
  fwMark?: number;
  doSnat?: boolean;
  toIP?: string;
  toPort?: number;
  onDefault?: boolean;
  counter?: string;
}

export interface FirewallEntry {
  ruleArguments: FirewallRuleEntry;
  opts: FirewallOptionEntry;
}

// ─── BGP ────────────────────────────────────────────────────────────────────

export interface BgpNeighEntry {
  ipAddress?: string;
  remoteAs?: number;
  state?: string;
  updowntime?: string;
}

// ─── Device / Version ───────────────────────────────────────────────────────

export interface DeviceInfoEntry {
  hostName?: string;
  machineID?: string;
  bootID?: string;
  OS?: string;
  kernel?: string;
  architecture?: string;
  uptime?: string;
}

// ─── Filesystem / Disk ──────────────────────────────────────────────────────

// FileSystemInfoEntry: returned by GET /status/filesystem
// Fields follow gopsutil DiskUsageStat naming conventions
export interface FileSystemInfoEntry {
  device?: string; // block device (e.g. /dev/sda1)
  mountPoint?: string; // mount path (e.g. /)
  fsType?: string; // filesystem type (e.g. ext4)
  total?: number; // total capacity in bytes
  free?: number; // free bytes
  used?: number; // used bytes
  usedPercent?: number; // used percentage (0–100)
}

export interface VersionEntry {
  version?: string;
  buildInfo?: string;
}

// ─── BGP Policy ──────────────────────────────────────────────────────────────

export interface BgpPolicyStatement {
  name?: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

export interface BgpPolicyDefinition {
  name?: string;
  statements?: BgpPolicyStatement[];
}

export interface BgpPolicyDefinitionList {
  bgpPolicy?: BgpPolicyDefinition[];
}

// ─── BFD ─────────────────────────────────────────────────────────────────────

export interface BfdGetEntry {
  remoteIP?: string;
  localIP?: string;
  state?: string;
  interval?: number;
  multiplier?: number;
  myDisc?: number;
  remDisc?: number;
}

export interface BfdList {
  bfdAttr?: BfdGetEntry[];
}

// ─── VLAN ────────────────────────────────────────────────────────────────────

export interface VlanMemberEntry {
  memberName?: string;
  tagged?: boolean;
}

export interface VlanGetEntry {
  vid?: number;
  member?: VlanMemberEntry[];
}

export interface VlanList {
  vlanAttr?: VlanGetEntry[];
}

// ─── VXLAN ───────────────────────────────────────────────────────────────────

export interface VxlanPeerEntry {
  peerIP?: string;
}

export interface VxlanBridgeEntry {
  vxlanId?: number;
  epIntf?: string;
  peers?: VxlanPeerEntry[];
}

export interface VxlanList {
  vxlanAttr?: VxlanBridgeEntry[];
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionEntry {
  ident?: string;
  sessionIP?: string;
  tunnelIP?: string;
  sessionType?: string;
}

export interface SessionList {
  sessionAttr?: SessionEntry[];
}

// ─── Policy (QoS) ────────────────────────────────────────────────────────────

export interface PolicyEntry {
  ident?: string;
  policyArguments?: {
    type?: number;
    rate?: number;
    burst?: number;
    peakRate?: number;
    peakBurst?: number;
    color?: number;
  };
}

export interface PolicyList {
  policyAttr?: PolicyEntry[];
}

// ─── Mirror ──────────────────────────────────────────────────────────────────

export interface MirrorGetEntry {
  ident?: string;
  mirrorArguments?: {
    mirrorType?: number;
    mirrorPort?: string;
    mirrorVlan?: number;
    mirrorIP?: string;
    mirrorTunnelId?: number;
    targetPort?: string;
    targetVlan?: number;
    rspan?: boolean;
  };
  info?: {
    portNum?: number;
  };
}

export interface MirrorList {
  mirrorAttr?: MirrorGetEntry[];
}

// ─── IPv4 Address ────────────────────────────────────────────────────────────

export interface IPv4AddressGetEntry {
  dev?: string;
  ipAddress?: string;
  mask?: number;
}

export interface IPv4AddressList {
  ipAttr?: IPv4AddressGetEntry[];
}

// ─── Neighbor (ARP) ──────────────────────────────────────────────────────────

export interface NeighborEntry {
  dev?: string;
  ipAddress?: string;
  macAddress?: string;
  state?: string;
}

export interface NeighborList {
  neighborAttr?: NeighborEntry[];
}

// ─── FDB (Forwarding Database) ───────────────────────────────────────────────

export interface FDBEntry {
  dev?: string;
  macAddress?: string;
  bridgeId?: number;
}

export interface FDBList {
  fdbAttr?: FDBEntry[];
}

// ─── IP Filter ───────────────────────────────────────────────────────────────

export interface IPFilterEntry {
  ruleArguments?: {
    ipNet?: string;
    direction?: number;
    preference?: number;
    protocol?: number;
    port?: number;
    portMax?: number;
    block?: boolean;
  };
}

export interface IPFilterList {
  ipFilterAttr?: IPFilterEntry[];
}

// ─── Security Rate Limiting ──────────────────────────────────────────────────

export interface SecurityRateEntry {
  ident?: string;
  config?: {
    rateLimit?: number;
    burstLimit?: number;
    blockDuration?: number;
    direction?: number;
  };
  stats?: {
    activeBlocks?: number;
    totalBlocked?: number;
  };
}

export interface SecurityRateList {
  securityRateAttr?: SecurityRateEntry[];
}

// ─── SNI Certificate ─────────────────────────────────────────────────────────

export interface SNICertificateEntry {
  name?: string;
  cert?: string;
  key?: string;
  domain?: string;
  expiresAt?: string;
  fingerprint?: string;
}

export interface SNICertificateList {
  sniAttr?: SNICertificateEntry[];
}

// ─── CORS ────────────────────────────────────────────────────────────────────

export interface CorsEntry {
  corsURL?: string;
  allowOrigin?: string;
  allowMethods?: string;
  allowHeaders?: string;
  maxAge?: number;
}

export interface CorsList {
  corsAttr?: CorsEntry[];
}

// ─── IPsec ───────────────────────────────────────────────────────────────────

export interface IPsecTunnel {
  name?: string;
  localIP?: string;
  remoteIP?: string;
  authAlg?: string;
  encAlg?: string;
  state?: string;
  ikeVersion?: number;
  lifetime?: number;
}

export interface IPsecTunnelList {
  tunnels?: IPsecTunnel[];
}

export interface IPsecSA {
  spi?: number;
  direction?: string;
  protocol?: string;
  mode?: string;
  encAlg?: string;
  authAlg?: string;
  expireBytes?: number;
  expirePackets?: number;
  expireTime?: string;
  localIP?: string;
  remoteIP?: string;
}

export interface IPsecSAList {
  sas?: IPsecSA[];
}

export interface IPsecStats {
  totalTunnels?: number;
  activeTunnels?: number;
  inboundBytes?: number;
  outboundBytes?: number;
  inboundPackets?: number;
  outboundPackets?: number;
  errors?: number;
}

export interface IPsecCertificate {
  name?: string;
  subject?: string;
  issuer?: string;
  notBefore?: string;
  notAfter?: string;
  fingerprint?: string;
  isCA?: boolean;
}

export interface IPsecCertificateList {
  certificates?: IPsecCertificate[];
}

// ─── GPU / AI Gateway ────────────────────────────────────────────────────────

export interface GPUWorkerMetrics {
  workerId?: string;
  gpuModel?: string;
  gpuMemoryTotal?: number;
  gpuMemoryUsed?: number;
  gpuUtilization?: number;
  activeConversations?: number;
}

export interface GPUMonitoringStatus {
  enabled?: boolean;
  workerCount?: number;
  activeConversations?: number;
  totalRequests?: number;
  workers?: GPUWorkerMetrics[];
}

// ─── Trace Parsers & Catalogs ────────────────────────────────────────────────

export interface TraceParserInfo {
  name: string;
  version: string;
  protocol: string;
  supported_paths?: string[];
  description?: string;
  capabilities?: string[];
}

export interface TraceParserList {
  parsers?: TraceParserInfo[];
}

export interface TraceCatalogEntry {
  name: string;
  parser_type: string;
  sample_rate: number;
  enabled: boolean;
  max_body_size?: number;
  version?: string;
  description?: string;
}

// ─── Auth (JWT) ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id?: number;
  username: string;
  password?: string;
  role?: "admin" | "viewer";
  created_at?: string;
}

export interface LoginResponse {
  token?: string;
}

export interface MessageResponse {
  message?: string;
}

export interface UpdateLicenseRequest {
  license_key: string;
}

// ─── Per-rule LB status & stats ──────────────────────────────────────────────

export interface LoadbalanceStatus {
  adminStateUp?: boolean;
  operatingStatus?: "ONLINE" | "OFFLINE" | "DEGRADED" | "ERROR" | "NO_MONITOR";
  lastUpdated?: string;
}

export interface LoadbalanceStats {
  activeConnections?: number;
  bytesIn?: number;
  bytesOut?: number;
  totalConnections?: number;
}

// ─── Config lifecycle (snapshot / restore / persist) ─────────────────────────

export interface RestorePlanItem {
  domain?: string;
  to_delete?: number;
  to_apply?: number;
}

export interface RestoreResult {
  mode?: "dry-run" | "commit" | "boot";
  compatible?: boolean;
  schema_version?: string;
  snapshot_gateway_version?: string;
  current_gateway_version?: string;
  plan?: RestorePlanItem[];
  errors?: string[];
  result?: string;
  pre_restore_snapshot_persisted?: string;
}

export interface PersistResult {
  result?: string;
  path?: string;
  checksum?: string;
}

// ─── AI-gateway operations (worker metrics, GPU, OPA) ────────────────────────

export interface WorkerMetricsEntry {
  endpoint_ip: string;
  queued_requests: number;
  swapped_requests?: number;
  kv_cache_usage_perc: number;
  num_gpu_blocks?: number;
  timestamp?: string;
}

export interface WorkerMetricsResponse {
  workers?: WorkerMetricsEntry[];
  monitoring_enabled?: boolean;
}

export interface WorkerMetricsUpdateResponse {
  endpoint_ip: string;
  queued_requests: number;
  message: string;
}

export interface GPUEnableResponse {
  enabled: boolean;
  routing_mode: string;
  message: string;
}

export interface ConversationCleanupResponse {
  deleted_count: number;
  oldest_remaining_hours: number;
  message: string;
}

export interface OPAWatcherConfig {
  opa_url: string;
  policy_path?: string;
  poll_interval_sec?: number;
  fail_open?: boolean;
}

export interface OPAWatcherStatus {
  opa_url?: string;
  policy_path?: string;
  poll_interval_sec?: number;
  fail_open?: boolean;
  status?: string;
  last_sync_at?: string;
  rules_count?: number;
  circuit_breaker_state?: number;
  last_error?: string;
}

export interface PostSuccessResponse {
  result?: string;
  message?: string;
}
