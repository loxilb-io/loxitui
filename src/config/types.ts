// Configuration type definitions for loxitui

export interface LoxilbConfig {
  host: string;
  port: number;
  tls: boolean;
  token: string;
  /** Optional JWT login username — exchanged for a token via /auth/login. */
  username: string;
  /** Optional JWT login password. */
  password: string;
}

export interface AiConfig {
  api_key: string;
  model: string;
  provider: string;
  base_url: string;
  knowledge_base_path: string;
  max_history_turns: number;
  /** Fraction (0.0–1.0) of the context window at which to trigger summarization */
  summary_threshold: number;
}

export interface MetricsConfig {
  enabled: boolean;
  poll_interval_s: number;
  history_points: number;
}

export interface UiConfig {
  refresh_interval_ms: number;
  default_panel: string;
  sidebar_width_pct: number;
}

export interface LogsConfig {
  log_path: string;
  max_lines: number;
}

export interface AuditConfig {
  enabled: boolean;
  log_path: string;
  stderr: boolean;
  max_size_mb: number;
  max_files: number;
}

export interface LoxilbTuiConfig {
  loxilb: LoxilbConfig;
  ai: AiConfig;
  metrics: MetricsConfig;
  ui: UiConfig;
  logs: LogsConfig;
  audit: AuditConfig;
  log_path: string;
  log_path_dp: string;
}

export const DEFAULT_CONFIG: LoxilbTuiConfig = {
  loxilb: {
    host: "127.0.0.1",
    port: 11111,
    tls: false,
    token: "",
    username: "",
    password: "",
  },
  ai: {
    api_key: "",
    model: "claude-3-5-sonnet-20241022",
    provider: "claude-cli",
    base_url: "",
    knowledge_base_path: "",
    max_history_turns: 20,
    summary_threshold: 0.7,
  },
  metrics: {
    enabled: true,
    poll_interval_s: 30,
    history_points: 60,
  },
  ui: {
    refresh_interval_ms: 5000,
    default_panel: "dashboard",
    sidebar_width_pct: 30,
  },
  logs: {
    log_path: "",
    max_lines: 50,
  },
  audit: {
    enabled: true,
    log_path: "~/.local/share/loxitui/audit.log",
    stderr: false,
    max_size_mb: 50,
    max_files: 5,
  },
  log_path: "/var/log/loxilb.log",
  log_path_dp: "/var/log/loxilbdp.log",
};
