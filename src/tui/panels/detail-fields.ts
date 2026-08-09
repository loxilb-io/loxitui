import type {
  BfdGetEntry,
  BgpNeighEntry,
  BgpPolicyDefinition,
  CiStateEntry,
  ConnAttr,
  CorsEntry,
  EndPointGetEntry,
  FDBEntry,
  FirewallEntry,
  IPFilterEntry,
  IPsecCertificate,
  IPsecSA,
  IPsecTunnel,
  IPv4AddressGetEntry,
  LbServiceArg,
  MirrorGetEntry,
  NeighborEntry,
  PolicyEntry,
  PortEntry,
  RouteEntry,
  SNICertificateEntry,
  SecurityRateEntry,
  SessionEntry,
  TraceParserInfo,
  TraceStatus,
  VlanGetEntry,
  VxlanBridgeEntry,
} from "@/api/models";
import type { DetailField } from "../components/DetailPane";
import { colors } from "../theme";

// ─── LB Service ──────────────────────────────────────────────────────────────

const MODE_LABELS: Record<number, string> = {
  0: "DNAT",
  1: "OneArm",
  2: "FullNAT",
  3: "DSR",
  4: "FullProxy",
  5: "HostOneArm",
  6: "AIGW",
};

const SEL_LABELS: Record<number, string> = {
  0: "rr",
  1: "hash",
  2: "wrr",
  3: "persist",
  4: "lc",
  5: "n2",
  6: "n3",
  7: "quic",
  8: "chwbl",
  9: "gpu",
  10: "wrrhash",
};

export function lbServiceFields(item: LbServiceArg): DetailField[] {
  const sa = item.serviceArguments;
  const epsUp = item.endpoints?.filter((e) => e.state === "active").length ?? 0;
  const epsTotal = item.endpoints?.length ?? 0;

  const fields: DetailField[] = [
    { label: "Name", value: sa.name || "—" },
    { label: "VIP", value: sa.externalIP || "—" },
    { label: "Port", value: String(sa.port ?? "—") },
    { label: "PortMax", value: sa.portMax != null ? String(sa.portMax) : "—" },
    { label: "Protocol", value: sa.protocol || "—" },
    { label: "Mode", value: MODE_LABELS[sa.mode ?? 0] ?? String(sa.mode ?? 0) },
    { label: "Selector", value: SEL_LABELS[sa.sel ?? 0] ?? String(sa.sel ?? 0) },
    { label: "Monitor", value: sa.monitor ? "yes" : "no" },
    { label: "BGP", value: sa.bgp ? "yes" : "no" },
    { label: "SNAT", value: sa.snat ? "yes" : "no" },
    { label: "Egress", value: sa.egress ? "yes" : "no" },
    { label: "Managed", value: sa.managed ? "yes" : "no" },
    {
      label: "Endpoints",
      value: `${epsUp}/${epsTotal} active`,
      color: epsUp > 0 ? colors.status.success : colors.status.error,
    },
  ];

  if (sa.probeport) {
    fields.push({ label: "ProbePort", value: String(sa.probeport) });
    fields.push({ label: "ProbePath", value: sa.path || "—" });
  }

  // Show individual endpoint IPs after the summary
  if (item.endpoints?.length) {
    const maxEps = 4;
    item.endpoints.slice(0, maxEps).forEach((ep, i) => {
      const stateColor =
        ep.state === "active"
          ? colors.status.success
          : ep.state === "softstop"
            ? colors.status.warning
            : colors.status.error;
      fields.push({
        label: `EP ${i + 1}`,
        value: `${ep.endpointIP}:${ep.targetPort}  w:${ep.weight}  ${ep.state ?? "?"}`,
        color: stateColor,
      });
    });
    if (item.endpoints.length > maxEps) {
      fields.push({
        label: "",
        value: `+${item.endpoints.length - maxEps} more`,
        color: colors.fg.muted,
      });
    }
  }

  return fields;
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

export function endpointFields(item: EndPointGetEntry): DetailField[] {
  const stateVal = item.currState || "—";
  const stateOk = stateVal.toLowerCase() === "ok" || stateVal.toLowerCase() === "active";
  return [
    { label: "Name", value: item.name || "—" },
    { label: "Host", value: item.hostName || "—" },
    { label: "ProbeType", value: item.probeType || "—" },
    { label: "ProbePort", value: item.probePort != null ? String(item.probePort) : "—" },
    {
      label: "State",
      value: stateVal,
      color: stateOk ? colors.status.success : colors.status.error,
    },
    {
      label: "Duration",
      value: item.probeDuration != null ? `${item.probeDuration}s` : "—",
    },
    { label: "ProbeReq", value: item.probeReq || "—" },
    { label: "ProbeResp", value: item.probeResp || "—" },
    { label: "AvgDelay", value: item.avgDelay || "—" },
    { label: "MinDelay", value: item.minDelay || "—" },
    { label: "MaxDelay", value: item.maxDelay || "—" },
    {
      label: "InactRetry",
      value: item.inactiveReTries != null ? String(item.inactiveReTries) : "—",
    },
  ];
}

// ─── Connection Tracking ─────────────────────────────────────────────────────

export function conntrackFields(item: ConnAttr): DetailField[] {
  const state = item.conntrackState ?? item.conntrackAct ?? "?";
  const lower = state.toLowerCase();
  const stateColor = lower.includes("established")
    ? colors.status.success
    : lower.includes("close")
      ? colors.status.error
      : colors.accent.secondary;
  return [
    { label: "Src IP", value: item.sourceIP || "—" },
    { label: "Src Port", value: String(item.sourcePort ?? "—") },
    { label: "Dst IP", value: item.destinationIP || "—" },
    { label: "Dst Port", value: String(item.destinationPort ?? "—") },
    { label: "Protocol", value: item.protocol || "—" },
    { label: "State", value: state, color: stateColor },
  ];
}

// ─── Route ───────────────────────────────────────────────────────────────────

const ROUTE_PROTO_LABELS: Record<number, string> = {
  0: "unspec",
  1: "redirect",
  2: "kernel",
  3: "boot",
  4: "static",
  8: "gated",
  9: "ra",
  10: "mrt",
  11: "zebra",
  12: "bird",
  16: "dhcp",
  42: "babel",
  186: "bgp",
  187: "isis",
  188: "ospf",
  189: "rip",
  192: "eigrp",
};

export function routeFields(item: RouteEntry): DetailField[] {
  const protoStr =
    item.protocol != null ? (ROUTE_PROTO_LABELS[item.protocol] ?? String(item.protocol)) : "—";
  return [
    { label: "Destination", value: item.destinationIPNet || "—" },
    { label: "Gateway", value: item.gateway || "—" },
    { label: "Interface", value: item.ifname || "—" },
    { label: "Protocol", value: protoStr },
  ];
}

// ─── Cluster ─────────────────────────────────────────────────────────────────

export function clusterFields(item: CiStateEntry): DetailField[] {
  const isMaster = item.state?.toLowerCase() === "master";
  return [
    { label: "Instance", value: item.instance || "—" },
    {
      label: "State",
      value: item.state || "—",
      color: isMaster ? colors.status.success : colors.status.warning,
    },
    { label: "VIP", value: item.vip || "—" },
    { label: "Sync", value: item.sync != null ? String(item.sync) : "—" },
  ];
}

// ─── Trace ───────────────────────────────────────────────────────────────────

export function traceFields(item: TraceStatus, rowIndex: number): DetailField[] {
  const isHttp = rowIndex === 0;
  const enabled = isHttp ? item.traceEnable === true : item.l4TraceEnable === true;
  return [
    { label: "Type", value: item.label ?? (isHttp ? "HTTP" : "L4") },
    {
      label: "Enabled",
      value: enabled ? "ENABLED" : "disabled",
      color: enabled ? colors.status.success : colors.fg.muted,
    },
    { label: "Protocol", value: item.traceProto || "—" },
  ];
}

// ─── Port ────────────────────────────────────────────────────────────────────

function linkColorStr(link?: unknown): string {
  if (link == null || link === "") return colors.status.warning;
  const l = String(link).toLowerCase();
  if (l === "up" || l === "yes") return colors.status.success;
  if (l === "down" || l === "no") return colors.status.error;
  return colors.status.warning;
}

export function portFields(item: PortEntry): DetailField[] {
  const hw = item.portHardwareInformation;
  const sw = item.portSoftwareInformation;
  const stat = item.portStatisticInformation;
  const l3 = item.portL3Information;

  const fields: DetailField[] = [
    { label: "Name", value: item.portName || "—" },
    { label: "PortNo", value: item.portNo != null ? String(item.portNo) : "—" },
    { label: "Zone", value: item.zone || "—" },
    { label: "MAC", value: hw?.macAddress || "—" },
    { label: "MTU", value: hw?.mtu != null ? String(hw.mtu) : "—" },
    {
      label: "Link",
      value: hw?.link != null ? (hw.link ? "up" : "down") : "—",
      color: linkColorStr(hw?.link),
    },
    { label: "State", value: hw?.state || "—" },
    { label: "Master", value: hw?.master || "—" },
    { label: "PortType", value: sw?.portType || "—" },
    { label: "Active", value: sw?.portActive ? "yes" : "no" },
  ];

  if (l3?.IPv4Address?.length) {
    fields.push({ label: "IPv4", value: l3.IPv4Address.join(", ") });
  }
  if (l3?.IPv6Address?.length) {
    fields.push({ label: "IPv6", value: l3.IPv6Address.join(", ") });
  }
  if (stat) {
    fields.push({
      label: "RxBytes",
      value: stat.rxBytes != null ? String(stat.rxBytes) : "—",
    });
    fields.push({
      label: "TxBytes",
      value: stat.txBytes != null ? String(stat.txBytes) : "—",
    });
  }

  return fields;
}

// ─── Firewall ────────────────────────────────────────────────────────────────

function actionStr(opts: FirewallEntry["opts"]): { text: string; color: string } {
  if (opts.allow) return { text: "ALLOW", color: colors.status.success };
  if (opts.drop) return { text: "DROP", color: colors.status.error };
  if (opts.redirect) return { text: "REDIRECT", color: colors.status.warning };
  if (opts.trap) return { text: "TRAP", color: colors.status.warning };
  return { text: "?", color: colors.fg.muted };
}

export function firewallFields(item: FirewallEntry): DetailField[] {
  const r = item.ruleArguments;
  const action = actionStr(item.opts);

  const srcPort =
    r.minSourcePort != null ? `${r.minSourcePort}–${r.maxSourcePort ?? r.minSourcePort}` : "*";
  const dstPort =
    r.minDestinationPort != null
      ? `${r.minDestinationPort}–${r.maxDestinationPort ?? r.minDestinationPort}`
      : "*";

  const fields: DetailField[] = [
    { label: "Src IP", value: r.sourceIP || "*" },
    { label: "Dst IP", value: r.destinationIP || "*" },
    { label: "Src Port", value: srcPort },
    { label: "Dst Port", value: dstPort },
    { label: "Protocol", value: r.protocol != null ? String(r.protocol) : "*" },
    { label: "Preference", value: r.preference != null ? String(r.preference) : "—" },
    { label: "Action", value: action.text, color: action.color },
    { label: "PortName", value: r.portName || "—" },
  ];

  if (item.opts.redirect && item.opts.redirectPortName) {
    fields.push({ label: "RedirPort", value: item.opts.redirectPortName });
  }
  if (item.opts.doSnat && item.opts.toIP) {
    fields.push({
      label: "SNAT to",
      value: `${item.opts.toIP}:${item.opts.toPort ?? "?"}`,
    });
  }
  if (item.opts.counter) {
    fields.push({ label: "Counter", value: item.opts.counter });
  }
  if (item.opts.fwMark) {
    fields.push({ label: "FwMark", value: String(item.opts.fwMark) });
  }

  return fields;
}

// ─── BGP Neighbor ─────────────────────────────────────────────────────────────

export function bgpNeighborFields(item: BgpNeighEntry): DetailField[] {
  const isEstablished = item.state?.toLowerCase() === "established";
  return [
    { label: "Peer IP", value: item.ipAddress || "—" },
    { label: "Remote ASN", value: item.remoteAs != null ? String(item.remoteAs) : "—" },
    {
      label: "State",
      value: item.state || "—",
      color: isEstablished ? colors.status.success : colors.status.warning,
    },
    { label: "Up/Down", value: item.updowntime || "—" },
  ];
}

// ─── BGP Policy ───────────────────────────────────────────────────────────────

export function bgpPolicyFields(item: BgpPolicyDefinition): DetailField[] {
  const fields: DetailField[] = [
    { label: "Name", value: item.name || "—" },
    { label: "Statements", value: String(item.statements?.length ?? 0) },
  ];
  if (item.statements) {
    item.statements.slice(0, 5).forEach((st, i) => {
      fields.push({ label: `Stmt ${i + 1}`, value: st.name || "—" });
      if (st.conditions) {
        const cond = st.conditions as Record<string, string | undefined>;
        if (cond.matchPrefix) fields.push({ label: "  Prefix", value: String(cond.matchPrefix) });
        if (cond.matchAsPath) fields.push({ label: "  AS-Path", value: String(cond.matchAsPath) });
        if (cond.matchCommunity)
          fields.push({ label: "  Community", value: String(cond.matchCommunity) });
      }
      if (st.actions) {
        const act = st.actions as Record<string, unknown>;
        if (act.routeAction) fields.push({ label: "  Action", value: String(act.routeAction) });
        if (act.setLocalPref != null)
          fields.push({ label: "  LocalPref", value: String(act.setLocalPref) });
        if (act.setMed != null) fields.push({ label: "  MED", value: String(act.setMed) });
        if (Array.isArray(act.setCommunity))
          fields.push({ label: "  Community", value: (act.setCommunity as string[]).join(",") });
      }
    });
  }
  return fields;
}

// ─── BFD Session ─────────────────────────────────────────────────────────────

export function bfdFields(item: BfdGetEntry): DetailField[] {
  const isUp = item.state?.toLowerCase() === "up";
  return [
    { label: "Remote IP", value: item.remoteIP || "—" },
    { label: "Local IP", value: item.localIP || "—" },
    {
      label: "State",
      value: item.state || "—",
      color: isUp ? colors.status.success : colors.status.warning,
    },
    { label: "Interval (us)", value: item.interval != null ? String(item.interval) : "—" },
    { label: "Multiplier", value: item.multiplier != null ? String(item.multiplier) : "—" },
    { label: "My Disc", value: item.myDisc != null ? String(item.myDisc) : "—" },
    { label: "Rem Disc", value: item.remDisc != null ? String(item.remDisc) : "—" },
  ];
}

// ─── VLAN ────────────────────────────────────────────────────────────────────

export function vlanFields(item: VlanGetEntry): DetailField[] {
  const fields: DetailField[] = [
    { label: "VID", value: item.vid != null ? String(item.vid) : "—" },
    { label: "Members", value: String(item.member?.length ?? 0) },
  ];
  if (item.member) {
    for (const m of item.member) {
      fields.push({
        label: m.memberName || "?",
        value: m.tagged ? "tagged" : "untagged",
        color: m.tagged ? colors.accent.primary : colors.fg.muted,
      });
    }
  }
  return fields;
}

// ─── VXLAN ───────────────────────────────────────────────────────────────────

export function vxlanFields(item: VxlanBridgeEntry): DetailField[] {
  const fields: DetailField[] = [
    { label: "VxLAN ID", value: item.vxlanId != null ? String(item.vxlanId) : "—" },
    { label: "EP Interface", value: item.epIntf || "—" },
    { label: "Peers", value: String(item.peers?.length ?? 0) },
  ];
  if (item.peers) {
    item.peers.forEach((p, i) => {
      fields.push({ label: `Peer ${i + 1}`, value: p.peerIP || "—" });
    });
  }
  return fields;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function sessionFields(item: SessionEntry): DetailField[] {
  return [
    { label: "Ident", value: item.ident || "—" },
    { label: "Session IP", value: item.sessionIP || "—" },
    { label: "Tunnel IP", value: item.tunnelIP || "—" },
    { label: "Type", value: item.sessionType || "—" },
  ];
}

// ─── QoS Policy ──────────────────────────────────────────────────────────────

export function policyFields(item: PolicyEntry): DetailField[] {
  const a = item.policyArguments;
  return [
    { label: "Ident", value: item.ident || "—" },
    { label: "Type", value: a?.type != null ? String(a.type) : "—" },
    { label: "Rate (bps)", value: a?.rate != null ? String(a.rate) : "—" },
    { label: "Burst (bps)", value: a?.burst != null ? String(a.burst) : "—" },
    { label: "Peak Rate", value: a?.peakRate != null ? String(a.peakRate) : "—" },
    { label: "Peak Burst", value: a?.peakBurst != null ? String(a.peakBurst) : "—" },
    { label: "Color", value: a?.color != null ? String(a.color) : "—" },
  ];
}

// ─── Mirror ──────────────────────────────────────────────────────────────────

const MIRROR_TYPE_LABELS: Record<number, string> = { 0: "Span", 1: "RSpan", 2: "ERSpan" };

export function mirrorFields(item: MirrorGetEntry): DetailField[] {
  const a = item.mirrorArguments;
  const typeStr =
    a?.mirrorType != null ? (MIRROR_TYPE_LABELS[a.mirrorType] ?? String(a.mirrorType)) : "—";
  return [
    { label: "Ident", value: item.ident || "—" },
    { label: "Type", value: typeStr },
    { label: "Mirror Port", value: a?.mirrorPort || "—" },
    { label: "Mirror VLAN", value: a?.mirrorVlan != null ? String(a.mirrorVlan) : "—" },
    { label: "Mirror IP", value: a?.mirrorIP || "—" },
    { label: "Tunnel ID", value: a?.mirrorTunnelId != null ? String(a.mirrorTunnelId) : "—" },
    { label: "Target Port", value: a?.targetPort || "—" },
    { label: "Target VLAN", value: a?.targetVlan != null ? String(a.targetVlan) : "—" },
    { label: "RSPAN", value: a?.rspan ? "yes" : "no" },
    { label: "Port Num", value: item.info?.portNum != null ? String(item.info.portNum) : "—" },
  ];
}

// ─── IPv4 Address ─────────────────────────────────────────────────────────────

export function ipv4Fields(item: IPv4AddressGetEntry): DetailField[] {
  return [
    { label: "IP Address", value: item.ipAddress || "—" },
    { label: "Mask", value: item.mask != null ? `/${String(item.mask)}` : "—" },
    { label: "Interface", value: item.dev || "—" },
  ];
}

// ─── ARP Neighbor ────────────────────────────────────────────────────────────

export function neighborFields(item: NeighborEntry): DetailField[] {
  const isReachable = item.state?.toLowerCase().includes("reachable");
  return [
    { label: "IP Address", value: item.ipAddress || "—" },
    { label: "MAC Address", value: item.macAddress || "—" },
    { label: "Interface", value: item.dev || "—" },
    {
      label: "State",
      value: item.state || "—",
      color: isReachable ? colors.status.success : colors.fg.muted,
    },
  ];
}

// ─── FDB ─────────────────────────────────────────────────────────────────────

export function fdbFields(item: FDBEntry): DetailField[] {
  return [
    { label: "MAC Address", value: item.macAddress || "—" },
    { label: "Interface", value: item.dev || "—" },
    { label: "Bridge ID", value: item.bridgeId != null ? String(item.bridgeId) : "—" },
  ];
}

// ─── IP Filter ────────────────────────────────────────────────────────────────

const IP_FILTER_DIR: Record<number, string> = { 0: "Ingress", 1: "Egress", 2: "Both" };

export function ipfilterFields(item: IPFilterEntry): DetailField[] {
  const r = item.ruleArguments;
  const dir = r?.direction != null ? (IP_FILTER_DIR[r.direction] ?? String(r.direction)) : "—";
  const action = r?.block ? "BLOCK" : "ALLOW";
  return [
    { label: "IP Net", value: r?.ipNet || "—" },
    { label: "Direction", value: dir },
    { label: "Priority", value: r?.preference != null ? String(r.preference) : "—" },
    { label: "Protocol", value: r?.protocol != null ? String(r.protocol) : "*" },
    { label: "Port", value: r?.port != null ? String(r.port) : "*" },
    { label: "Port Max", value: r?.portMax != null ? String(r.portMax) : "—" },
    {
      label: "Action",
      value: action,
      color: r?.block ? colors.status.error : colors.status.success,
    },
  ];
}

// ─── Security Rate ────────────────────────────────────────────────────────────

export function secrateFields(item: SecurityRateEntry): DetailField[] {
  const activeBlocks = item.stats?.activeBlocks ?? 0;
  return [
    { label: "Ident", value: item.ident || "—" },
    {
      label: "Rate Limit",
      value: item.config?.rateLimit != null ? String(item.config.rateLimit) : "—",
    },
    {
      label: "Burst Limit",
      value: item.config?.burstLimit != null ? String(item.config.burstLimit) : "—",
    },
    {
      label: "Block Duration",
      value: item.config?.blockDuration != null ? `${item.config.blockDuration}s` : "—",
    },
    {
      label: "Direction",
      value: item.config?.direction != null ? String(item.config.direction) : "—",
    },
    {
      label: "Active Blocks",
      value: String(activeBlocks),
      color: activeBlocks > 0 ? colors.status.warning : colors.fg.secondary,
    },
    {
      label: "Total Blocked",
      value: item.stats?.totalBlocked != null ? String(item.stats.totalBlocked) : "—",
    },
  ];
}

// ─── SNI Certificate ──────────────────────────────────────────────────────────

export function sniCertFields(item: SNICertificateEntry): DetailField[] {
  return [
    { label: "Name", value: item.name || "—" },
    { label: "Domain", value: item.domain || "—" },
    { label: "Expires At", value: item.expiresAt || "—" },
    { label: "Fingerprint", value: item.fingerprint || "—" },
  ];
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

export function corsFields(item: CorsEntry): DetailField[] {
  return [
    { label: "URL", value: item.corsURL || "—" },
    { label: "Allow Origin", value: item.allowOrigin || "—" },
    { label: "Allow Methods", value: item.allowMethods || "—" },
    { label: "Allow Headers", value: item.allowHeaders || "—" },
    { label: "Max Age", value: item.maxAge != null ? `${item.maxAge}s` : "—" },
  ];
}

// ─── IPsec Tunnel ────────────────────────────────────────────────────────────

export function ipsecTunnelFields(item: IPsecTunnel): DetailField[] {
  const isUp = item.state?.toLowerCase() === "established" || item.state?.toLowerCase() === "up";
  return [
    { label: "Name", value: item.name || "—" },
    { label: "Local IP", value: item.localIP || "—" },
    { label: "Remote IP", value: item.remoteIP || "—" },
    { label: "Auth Alg", value: item.authAlg || "—" },
    { label: "Enc Alg", value: item.encAlg || "—" },
    {
      label: "State",
      value: item.state || "—",
      color: isUp ? colors.status.success : colors.status.warning,
    },
    { label: "IKE Version", value: item.ikeVersion != null ? String(item.ikeVersion) : "—" },
    { label: "Lifetime", value: item.lifetime != null ? `${item.lifetime}s` : "—" },
  ];
}

// ─── IPsec SA ────────────────────────────────────────────────────────────────

export function ipsecSAFields(item: IPsecSA): DetailField[] {
  return [
    { label: "SPI", value: item.spi != null ? String(item.spi) : "—" },
    { label: "Direction", value: item.direction || "—" },
    { label: "Protocol", value: item.protocol || "—" },
    { label: "Mode", value: item.mode || "—" },
    { label: "Enc Alg", value: item.encAlg || "—" },
    { label: "Auth Alg", value: item.authAlg || "—" },
    { label: "Local IP", value: item.localIP || "—" },
    { label: "Remote IP", value: item.remoteIP || "—" },
    { label: "Expire Bytes", value: item.expireBytes != null ? String(item.expireBytes) : "—" },
    {
      label: "Expire Packets",
      value: item.expirePackets != null ? String(item.expirePackets) : "—",
    },
    { label: "Expire Time", value: item.expireTime || "—" },
  ];
}

// ─── IPsec Certificate ───────────────────────────────────────────────────────

export function ipsecCertFields(item: IPsecCertificate): DetailField[] {
  return [
    { label: "Name", value: item.name || "—" },
    { label: "Subject", value: item.subject || "—" },
    { label: "Issuer", value: item.issuer || "—" },
    { label: "Not Before", value: item.notBefore || "—" },
    { label: "Not After", value: item.notAfter || "—" },
    { label: "Fingerprint", value: item.fingerprint || "—" },
    {
      label: "Is CA",
      value: item.isCA ? "yes" : "no",
      color: item.isCA ? colors.accent.primary : colors.fg.muted,
    },
  ];
}

// ─── Trace Parser ────────────────────────────────────────────────────────────

export function traceParserFields(item: TraceParserInfo): DetailField[] {
  return [
    { label: "Name", value: item.name || "—" },
    { label: "Version", value: item.version || "—" },
    { label: "Protocol", value: item.protocol || "—" },
    { label: "Paths", value: item.supported_paths?.join(", ") || "—" },
    { label: "Capabilities", value: item.capabilities?.join(", ") || "—" },
    { label: "Description", value: item.description || "—" },
  ];
}
