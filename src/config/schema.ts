import { z } from "zod";

export const LoxilbConfigSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(11111),
  tls: z.boolean().default(false),
  token: z.string().default(""),
  // Optional JWT login credentials (POST /auth/login); when set, the TUI
  // exchanges them for a token at startup and refreshes before expiry.
  username: z.string().default(""),
  password: z.string().default(""),
});

export const AiConfigSchema = z.object({
  api_key: z.string().default(""),
  model: z.string().min(1).default("claude-3-5-sonnet-20241022"),
  provider: z.string().default("claude-cli"),
  base_url: z.string().default(""),
  knowledge_base_path: z.string().default(""),
  max_history_turns: z.number().int().min(1).max(100).default(20),
  summary_threshold: z.number().min(0.1).max(1.0).default(0.7),
});

export const MetricsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  poll_interval_s: z.number().int().min(5).max(300).default(30),
  history_points: z.number().int().min(10).max(1000).default(60),
});

export const UiConfigSchema = z.object({
  refresh_interval_ms: z.number().int().min(1000).default(5000),
  default_panel: z
    .enum([
      "dashboard",
      "lb",
      "endpoints",
      "conntrack",
      "routes",
      "cluster",
      "trace",
      "metrics",
      "logs",
    ])
    .default("dashboard"),
  sidebar_width_pct: z.number().int().min(15).max(50).default(30),
});

export const LogsConfigSchema = z.object({
  log_path: z.string().default(""),
  max_lines: z.coerce.number().int().min(1).max(10000).default(50),
});

export const auditSchema = z.object({
  enabled: z.boolean().default(true),
  log_path: z.string().default("~/.local/share/loxitui/audit.log"),
  stderr: z.boolean().default(false),
  max_size_mb: z.number().int().min(1).max(1024).default(50),
  max_files: z.number().int().min(1).max(20).default(5),
});

export const LoxilbTuiConfigSchema = z.object({
  loxilb: LoxilbConfigSchema.default({}),
  ai: AiConfigSchema.default({}),
  metrics: MetricsConfigSchema.default({}),
  ui: UiConfigSchema.default({}),
  logs: LogsConfigSchema.default({}),
  audit: auditSchema.default({}),
  log_path: z.string().default("/var/log/loxilb.log"),
  log_path_dp: z.string().default("/var/log/loxilbdp.log"),
});

export type ValidatedConfig = z.infer<typeof LoxilbTuiConfigSchema>;
