/** Shared color and layout constants for loxitui */

export const colors = {
  bg: {
    primary: "#0d1117",
    secondary: "#161b22",
    tertiary: "#21262d",
    highlight: "#2d333b",
    panel: "#13181f",
  },
  fg: {
    primary: "#e6edf3",
    secondary: "#8b949e",
    muted: "#484f58",
    dim: "#30363d",
  },
  status: {
    success: "#3fb950",
    warning: "#d29922",
    error: "#f85149",
    info: "#58a6ff",
  },
  accent: {
    primary: "#58a6ff", // blue – LoxiLB brand
    secondary: "#7ee787", // green
    tertiary: "#f0883e", // orange
    ai: "#bc8cff", // purple for AI sidebar
  },
  border: {
    normal: "#30363d",
    active: "#58a6ff",
    muted: "#21262d",
  },
} as const;

export const layout = {
  header: { height: 1 },
  footer: { height: 1 },
  tabBar: { height: 2 },
  sidebar: { width: 42 },
} as const;

export const keyHints = [
  { key: "Tab/←→", description: "switch panel" },
  { key: "[/]", description: "group" },
  { key: "↑↓", description: "navigate" },
  { key: "n", description: "new" },
  { key: "d", description: "delete" },
  { key: "^G", description: "AI sidebar" },
  { key: "^R", description: "refresh" },
  { key: "^F", description: "search" },
  { key: "q", description: "quit" },
] as const;

export type TabId =
  // ── OVERVIEW (basic ops) ─────────────────────────────────────────────────
  | "dashboard"
  | "services"
  | "endpoints"
  | "conntrack"
  | "routes"
  | "cluster"
  | "trace"
  | "metrics"
  | "logs"
  | "ports"
  // ── SEC ──────────────────────────────────────────────────────────────────
  | "firewall"
  | "ipfilter"
  | "secrate"
  | "sni"
  | "cors"
  // ── BGP ──────────────────────────────────────────────────────────────────
  | "bgp"
  | "bgp-policy"
  | "bfd"
  // ── L2 ───────────────────────────────────────────────────────────────────
  | "vlan"
  | "vxlan"
  | "session"
  | "policy"
  | "mirror"
  | "ipv4addr"
  | "neighbor"
  | "fdb"
  // ── IPSEC ────────────────────────────────────────────────────────────────
  | "ipsec-tunnels"
  | "ipsec-sas"
  | "ipsec-stats"
  | "ipsec-certs"
  // ── AI ───────────────────────────────────────────────────────────────────
  | "gpu"
  | "trace-parsers";

export interface TabGroup {
  id: string;
  label: string;
  tabs: { id: TabId; label: string; fullLabel: string }[];
}

export const TAB_GROUPS: TabGroup[] = [
  {
    id: "overview",
    label: "OVERVIEW",
    tabs: [
      { id: "dashboard", label: "Dash", fullLabel: "Dashboard" },
      { id: "services", label: "Svc", fullLabel: "LB Services" },
      { id: "endpoints", label: "EP", fullLabel: "Endpoints" },
      { id: "metrics", label: "Met", fullLabel: "Metrics" },
      { id: "logs", label: "Log", fullLabel: "Logs" },
    ],
  },
  {
    id: "network",
    label: "NET",
    tabs: [
      { id: "conntrack", label: "CT", fullLabel: "ConnTrack" },
      { id: "routes", label: "Routes", fullLabel: "Routes" },
      { id: "cluster", label: "Cluster", fullLabel: "Cluster" },
      { id: "trace", label: "Trace", fullLabel: "Trace" },
      { id: "ports", label: "Ports", fullLabel: "Ports" },
    ],
  },
  {
    id: "security",
    label: "SEC",
    tabs: [
      { id: "firewall", label: "FW", fullLabel: "Firewall" },
      { id: "ipfilter", label: "IPFilter", fullLabel: "IP Filter" },
      { id: "secrate", label: "RateLimit", fullLabel: "Rate Limit" },
      { id: "sni", label: "SNI", fullLabel: "SNI" },
      { id: "cors", label: "CORS", fullLabel: "CORS" },
    ],
  },
  {
    id: "bgp",
    label: "BGP",
    tabs: [
      { id: "bgp", label: "Neighbors", fullLabel: "BGP Neighbors" },
      { id: "bgp-policy", label: "Policy", fullLabel: "BGP Policy" },
      { id: "bfd", label: "BFD", fullLabel: "BFD" },
    ],
  },
  {
    id: "l2",
    label: "L2",
    tabs: [
      { id: "vlan", label: "VLAN", fullLabel: "VLAN" },
      { id: "vxlan", label: "VxLAN", fullLabel: "VxLAN" },
      { id: "session", label: "Session", fullLabel: "Session" },
      { id: "policy", label: "Policy", fullLabel: "L2 Policy" },
      { id: "mirror", label: "Mirror", fullLabel: "Mirror" },
      { id: "ipv4addr", label: "IPv4", fullLabel: "IPv4 Addr" },
      { id: "neighbor", label: "ARP", fullLabel: "ARP Neighbors" },
      { id: "fdb", label: "FDB", fullLabel: "FDB" },
    ],
  },
  {
    id: "ipsec",
    label: "IPSEC",
    tabs: [
      { id: "ipsec-tunnels", label: "Tunnels", fullLabel: "IPSec Tunnels" },
      { id: "ipsec-sas", label: "SAs", fullLabel: "IPSec SAs" },
      { id: "ipsec-stats", label: "Stats", fullLabel: "IPSec Stats" },
      { id: "ipsec-certs", label: "Certs", fullLabel: "IPSec Certs" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    tabs: [
      { id: "gpu", label: "GPU", fullLabel: "GPU" },
      { id: "trace-parsers", label: "Parsers", fullLabel: "Trace Parsers" },
    ],
  },
];

export const TABS: { id: TabId; label: string }[] = TAB_GROUPS.flatMap((g) => g.tabs);
