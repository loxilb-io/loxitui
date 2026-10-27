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
  // 0=DNAT, 1=OneArm, 2=FullNAT, 3=DSR, 4=FullProxy, 5=HostOneArm
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

// ─── Readiness, capabilities & diagnostics ───────────────────────────────────

export interface ReadyStatus {
  ready: boolean;
  reasons?: string[];
  boot?: BootStatus;
  external_dependencies?: ExternalDependencyStatus[];
  last_persist?: ConfigOpRecord;
  last_restore?: ConfigOpRecord;
  auto_persist?: AutoPersistStatus;
  ebpf_attachments?: EbpfAttachmentStatus[];
}

export interface BootStatus {
  profile?: string;
  snapshot_found: boolean;
  succeeded: boolean;
  generation?: number;
  quarantine_path?: string;
  legacy_fallback: boolean;
  degraded: boolean;
  reasons?: string[];
}

export interface ExternalDependencyStatus {
  type?: string;
  id?: string;
  generation?: string;
  digest?: string;
  required?: boolean;
  status?: "ready" | "configured" | "verified" | "warning" | "failed" | "declared";
}

export interface ConfigOpRecord {
  generation?: number;
  checksum?: string;
  mode?: string;
  at?: string;
}

export interface AutoPersistStatus {
  consecutive_failures?: number;
  last_error?: string;
  last_attempt?: string;
}

export interface EbpfAttachmentStatus {
  name: string;
  mode: "tc" | "xdp";
  attached: boolean;
}

export interface CapabilityStatusList {
  capabilities: CapabilityStatus[];
}

export interface CapabilityStatus {
  name: string;
  ready: boolean;
  reason_code?: string;
  reason?: string;
  limit?: number;
  in_use?: number;
}

export interface DiagnosticsStatus {
  version: string;
  build_info?: string;
  product?: string;
  api_version?: string;
  uptime_seconds: number;
  ready: boolean;
  ready_reasons?: string[];
  maintenance_state: "active" | "maintenance";
  ebpf_attachments?: EbpfAttachmentStatus[];
  maps?: MapUtilization[];
  external_dependencies?: DependencyDiagnostic[];
  boot?: BootStatus;
  last_persist?: ConfigOpRecord;
  last_restore?: ConfigOpRecord;
  auto_persist?: AutoPersistStatus;
}

export interface MapUtilization {
  name: string;
  count: number;
  capacity: number;
}

export interface DependencyDiagnostic {
  type: string;
  required: boolean;
  status: "ready" | "failed";
  latency_class: "fast" | "slow" | "failed";
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export interface MaintenanceStatus {
  state: "active" | "maintenance";
  operation_id?: string;
  refusing_new_config: boolean;
  refusing_new_inference: boolean;
  in_flight_streams: number;
  in_flight_requests?: number;
  entered_at?: string;
  elapsed_seconds: number;
  drain_timeout_seconds?: number;
  drain_deadline_exceeded: boolean;
  cancellable: boolean;
}

export interface MaintenanceRequest {
  enabled: boolean;
  drain_timeout_seconds?: number;
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export interface AuditStatus {
  available?: boolean;
  running?: boolean;
  boot_id?: string;
  seq_high?: number;
  last_write?: string;
  accepted?: Record<string, number>;
  dropped?: AuditDropCount[];
  result_drops?: number;
  originator_dropped?: number;
  delegation_lookups?: number;
  queue_depth?: Record<string, number>;
  queue_hwm?: Record<string, number>;
  write_failures?: number;
  sync_failures?: number;
  mgmt_timeouts?: number;
  panics?: number;
  restarts?: number;
  heartbeats?: number;
  rotations?: number;
  path_sanitized?: number;
  unattributed?: number;
  perm_repaired?: number;
  rotation_failed?: number;
  compress_failed?: number;
  compress_skipped?: number;
  pruned?: number;
  reserve_breaches?: number;
  reserve_breached?: boolean;
  sealed_bytes?: number;
  orphaned_intents?: number;
  last_orphan_event_id?: string;
  segment?: AuditSegmentStatus;
  retention?: AuditRetentionPolicy;
  projected_retention_days?: number;
  producers?: AuditProducerStatus[];
  compliance_sink?: boolean;
  sinks?: AuditSinkStatus[];
}

export interface AuditDropCount {
  stream?: string;
  reason?: string;
  count?: number;
}

export interface AuditSegmentStatus {
  uuid?: string;
  opened?: string;
  records?: number;
  bytes?: number;
}

export interface AuditRetentionPolicy {
  max_age_seconds?: number;
  max_bytes?: number;
  reserve_bytes?: number;
}

export interface AuditProducerStatus {
  id?: string;
  stream?: string;
  pseq_high?: number;
  accepted?: number;
  dropped?: Record<string, number>;
  drop_ring_overflows?: number;
}

export interface AuditPolicy {
  max_segment_bytes?: number;
  max_segment_age_seconds?: number;
  retention_max_age_seconds?: number;
  retention_max_bytes?: number;
  retention_reserve_bytes?: number;
  retention_max_prune_per_pass?: number;
}

export interface AuditSink {
  enabled?: boolean;
  address?: string;
  ca_bundle_path?: string;
  server_name?: string;
  client_cert_path?: string;
  client_key_path?: string;
  max_frame_bytes?: number;
  facility?: number;
  connected?: boolean;
  submitted?: number;
  truncated?: number;
  write_errors?: number;
  last_error?: string;
}

export interface AuditSinkStatus {
  name?: string;
  compliance?: boolean;
  state?: string;
  cursor?: AuditSinkCursor;
  in_active_segment?: boolean;
  lag_records?: number;
  lag_drops?: number;
}

export interface AuditNamedSink {
  name?: string;
  address?: string;
  ca_bundle_path?: string;
  server_name?: string;
  client_cert_path?: string;
  client_key_path?: string;
  max_frame_bytes?: number;
  facility?: number;
  enterprise_number?: number;
  filter?: AuditSinkFilter;
  state?: string;
  cursor?: AuditSinkCursor;
  xseq_high?: number;
  xseq_epoch?: number;
  submitted?: number;
  filtered?: number;
  resent?: number;
  poison?: number;
  truncated?: number;
  write_errors?: number;
  lag_drops?: number;
  last_error?: string;
}

export interface AuditSinkFilter {
  streams?: string[];
  services?: string[];
  outcome?: string;
  data_sample?: number;
}

export interface AuditSinkCursor {
  segment_uuid?: string;
  seq?: number;
}

export interface AuditRotateResult {
  sealed_segment_uuid?: string;
  new_segment_uuid?: string;
}

// ─── Half-close, sockmap reset & KV-exact status ─────────────────────────────

export interface HalfCloseConfig {
  allow?: boolean;
  capSeconds?: number;
  defaultMode?: string;
}

export interface SockMapResetResult {
  droppedConnections?: number;
}

export interface KvExactStatusList {
  kvExactStatusAttr?: KvExactStatusEntry[];
}

export interface KvExactStatusEntry {
  ruleIdentity: string;
  modelName: string;
  engineFamily: string;
  apiMode: string;
  modelProfileId?: string;
  modelProfileGen?: number;
  engineContractId?: string;
  engineContractGen?: number;
  bindingGen?: number;
  bindingDigest?: string;
  hashContractId?: string;
  wireSchemaId?: string;
  pdDialectId?: string;
  requiredEvidenceLevel?: string;
  desiredState: string;
  enforcedState: string;
  reasonCodes: string[];
  enforcement?: KvExactEnforcement;
}

export interface KvExactEnforcement {
  desired: string;
  enforced: string;
  lastAckAt?: string;
  fault?: string;
  goFenced?: boolean;
}

// ─── AI objectives, network identities & JWT auth profiles ───────────────────

export interface AIObjectiveList {
  objectiveAttr?: AIObjectiveEntry[];
  source?: string;
  source_timestamp?: string;
  store_reachable?: boolean;
  store_last_read?: string;
}

export interface AIObjectiveEntry {
  name: string;
  services?: string[];
  priority?: number;
  updated_at?: string;
}

export interface NetIdentityList {
  netIdentityAttr?: NetIdentityEntry[];
}

export interface NetIdentityEntry {
  name: string;
  match: Record<string, unknown>;
  services?: string[];
  tenant: string;
  allowed_models?: string[];
  enforce?: "advisory" | "strict";
  credential?: "none" | "network";
  forward_identity?: boolean;
  priority_class?: "standard" | "critical" | "sheddable";
  fail_mode?: "neutral" | "closed";
}

export interface JWTAuthProfileList {
  jwtAuthProfileAttr?: JWTAuthProfileEntry[];
}

export interface JWTAuthProfileEntry {
  name: string;
  issuer: string;
  jwks_url?: string;
  audiences?: string[];
  algs?: string[];
  leeway_sec?: number;
  refresh_sec?: number;
  tenant_claim?: string;
  user_claim?: string;
  models_claim?: string;
  roles_claim?: string;
  model_role_prefix?: string;
  username_claim?: string;
  model_authz?: "claims-required" | "allow-all";
  default_tenant?: string;
  forward_identity?: boolean;
  authorization_passthrough?: boolean;
  priority_class?: "standard" | "critical" | "sheddable";
}

// ─── AI rate limits (per-user & defaults) ────────────────────────────────────

export interface UserRateLimitMod {
  tenant_id: string;
  user_id: string;
  rps?: number;
  burst_size?: number;
  tokens_per_min?: number;
  model_limits?: UserModelRateLimit[];
}

export interface UserRateLimitEntry {
  tenant_id: string;
  user_id: string;
  rps?: number;
  burst_size?: number;
  tokens_per_min?: number;
  model_limits?: UserModelRateLimit[];
  updated_at?: string;
}

export interface UserModelRateLimit {
  model?: string;
  tokens_per_min?: number;
}

export interface RateLimitDefaultsMod {
  scope: "global" | "rule";
  rule_ident?: string;
  default_user_rps?: number;
  default_user_tpm?: number;
  default_tenant_rps?: number;
  default_tenant_tpm?: number;
  vip_shared_rps?: number;
  vip_shared_tpm?: number;
}

export interface RateLimitDefaultsEntry {
  scope: "global" | "rule";
  rule_ident?: string;
  default_user_rps?: number;
  default_user_tpm?: number;
  default_tenant_rps?: number;
  default_tenant_tpm?: number;
  vip_shared_rps?: number;
  vip_shared_tpm?: number;
  updated_at?: string;
}

// ─── AI model profiles ───────────────────────────────────────────────────────

export interface AiModelProfileRegistry {
  registryGeneration: number;
  setDigest?: string;
  profiles: AiModelProfileEntry[];
}

export interface AiModelProfileEntry {
  profileId: string;
  gen: number;
  baseModel: string;
  aliasPolicy: "base_model_only" | "list";
  allowedAliases?: string[];
  supportedApis: string[];
  supportedFeatures?: string[];
  excludedFeatures?: string[];
  tokenizerRevision?: string;
  tokenizerSha256: string;
  templateSha256?: string;
  templateContentFormat?: string;
  rendererEngine?: string;
  rendererVersion?: string;
  oracleEngine?: string;
  oracleVersion?: string;
}

// ─── API key patch, KV inventory & DPU (swagger-extras.yml) ──────────────────

export interface ApiKeyPatch {
  allowed_models?: string[];
  enabled?: boolean;
  rate_limit_rps?: number;
  burst_size?: number;
  tokens_per_min?: number;
  priority_class?: "" | "standard" | "critical" | "sheddable";
  default_objective?: string;
  allowed_objectives?: string[];
}

export interface KvInventory {
  service_id?: number;
  ep_idx?: number;
  hash_algo?: string;
  admission?: string;
  blocks?: { block_idx?: number; hash_uint64?: string }[]; // uint64 kept exact as digits
  total?: number;
}

export interface DpuDebugQuery {
  flows?: string;
  pipe?: string;
  svc?: string;
  ep?: string;
  limit?: number;
}

export interface DpuDebugResponse {
  enabled?: boolean;
  offload_success?: number;
  offload_failure?: number;
  offload_active?: number;
  offload_success_by_pipe?: Record<string, number>;
  offload_failure_by_pipe?: Record<string, number>;
  offload_active_by_pipe?: Record<string, number>;
  plugins?: string[];
  flows?: Record<string, unknown>[];
  fdb_entries?: Record<string, unknown>[];
  route_entries?: Record<string, unknown>[];
  acl_entries?: Record<string, unknown>[];
  circuit_breaker_open?: boolean;
  doca_entry_details?: Record<string, unknown>[];
}

export interface DpuDebugAction {
  action: "unregister" | "cb_force";
  plugin?: string;
  mode?: "open" | "close";
}

export interface DpuDebugActionResult {
  status?: string;
  circuit_breaker_open?: boolean;
}

export interface DpuHwCounters {
  flows?: {
    flow_id?: string;
    protocol?: string;
    src_ip?: string;
    dst_ip?: string;
    packets?: number;
    bytes?: number;
  }[];
  total_flows?: number;
}
