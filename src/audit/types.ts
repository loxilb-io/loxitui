/**
 * Typed audit event definitions for loxitui.
 * Pure types only — no runtime code.
 * Discriminated union on the 'event' field enables exhaustive switch in consumers.
 */

export interface AuditEventBase {
  ts: string;
  level: "INFO" | "WARN" | "ERROR";
  session: string;
  event: string;
  component: string;
  ms?: number;
}

// ── app events ───────────────────────────────────────────────────────────────

export interface AppStartupEvent extends AuditEventBase {
  event: "app.startup";
  component: "app";
  data: {
    version: string;
    provider: string;
    host: string;
    port: number;
    token: "[REDACTED]";
  };
}

export interface AppShutdownEvent extends AuditEventBase {
  event: "app.shutdown";
  component: "app";
  data: {
    uptime_ms: number;
  };
}

export interface AppErrorEvent extends AuditEventBase {
  event: "app.error";
  level: "ERROR";
  component: "app";
  data: {
    error: string;
    stack?: string;
  };
}

// ── ai events ────────────────────────────────────────────────────────────────

/** query is the last user message content, truncated to 200 chars */
export interface AiQueryEvent extends AuditEventBase {
  event: "ai.query";
  component: "ai";
  data: {
    provider: string;
    model: string;
    query: string;
    /** Number of prior user+assistant messages in context (excluding the new user message) */
    history_turns: number;
  };
}

/** Emitted by claude-cli provider when prior conversation is injected into the system prompt */
export interface AiContextInjectEvent extends AuditEventBase {
  event: "ai.context_inject";
  component: "ai";
  data: {
    /** Number of prior messages included in the system prompt history block */
    prior_msgs: number;
    /** Character length of the injected history block (after truncation) */
    inject_chars: number;
    /** True if the history block was truncated to MAX_HISTORY_INJECT_CHARS */
    truncated: boolean;
  };
}

/** Emitted when in-memory chat history is compressed via summarization */
export interface AiCompressionEvent extends AuditEventBase {
  event: "ai.compression";
  component: "ai";
  data: {
    /** Message count before compression */
    before_msgs: number;
    /** Message count after compression (summary + kept tail turns) */
    after_msgs: number;
    /** Estimated token count that triggered compression */
    estimated_tokens: number;
  };
}

export interface AiResponseEvent extends AuditEventBase {
  event: "ai.response";
  component: "ai";
  data: {
    provider: string;
    /** ms field carries latency */
    status: "ok" | "aborted";
  };
}

export interface AiErrorEvent extends AuditEventBase {
  event: "ai.error";
  level: "ERROR";
  component: "ai";
  data: {
    provider: string;
    error: string;
  };
}

// ── skill / claude-agent events ───────────────────────────────────────────────

/** Emitted once per .md file successfully loaded from the claude-agents/agents directory */
export interface AiSkillLoadedEvent extends AuditEventBase {
  event: "ai.skill_loaded";
  component: "ai";
  data: {
    /** Stem name of the skill file, e.g. "loxilb-ebpf" */
    name: string;
    /** First-line description extracted from the markdown */
    description: string;
    /** Character length of the skill content */
    content_chars: number;
    /** Absolute path to the loaded skill file */
    source_path: string;
  };
}

/** Emitted once after loadSkills() completes — summarises what was discovered */
export interface AiSkillsReadyEvent extends AuditEventBase {
  event: "ai.skills_ready";
  component: "ai";
  data: {
    /** Directory that was scanned */
    skills_dir: string;
    /** Total number of agent skills loaded (excluding the built-in default) */
    count: number;
    /** Names of all loaded skills */
    skill_names: string[];
  };
}

/** Emitted at the start of each AI query to record which agent skill was selected */
export interface AiSkillSelectedEvent extends AuditEventBase {
  event: "ai.skill_selected";
  component: "ai";
  data: {
    /** Skill key that was chosen, e.g. "loxilb-ebpf" or "default" */
    skill: string;
    /** Display description of the selected skill */
    description: string;
    /** The keyword tokens from the query that triggered this routing decision */
    matched_keywords: string[];
    /** Weighted confidence score (0-1) from the keyword matcher */
    confidence: number;
    /** How the skill was selected: keyword match, LLM classifier, slash command, or fallback */
    source: "keyword" | "llm" | "default" | "slash_command";
  };
}

// ── mcp tool events ──────────────────────────────────────────────────────────

export interface AiToolCallEvent extends AuditEventBase {
  event: "ai.tool_call";
  component: "mcp";
  data: {
    tool_name: string;
    args_summary: string;
  };
}

export interface AiToolResultEvent extends AuditEventBase {
  event: "ai.tool_result";
  component: "mcp";
  data: {
    tool_name: string;
    /** ms field carries tool latency */
    status: "ok" | "error";
    error?: string;
  };
}

// ── api events ───────────────────────────────────────────────────────────────

export interface ApiRequestEvent extends AuditEventBase {
  event: "api.request";
  component: "api";
  data: {
    method: string;
    path: string;
    /** ms field carries request latency */
    status: number;
    error?: string;
  };
}

// ── cmd events ───────────────────────────────────────────────────────────────

export interface CmdDispatchEvent extends AuditEventBase {
  event: "cmd.dispatch";
  component: "cmd";
  data: {
    verb: string;
    resource: string;
    args_count: number;
    ok: boolean;
    message: string;
  };
}

// ── tui events ───────────────────────────────────────────────────────────────

/**
 * action is a short snake_case slug:
 * 'ai_sidebar_open', 'ai_sidebar_close', 'form_create_lb', 'form_create_route',
 * 'delete_confirm', 'log_analysis_trigger', 'panel_switch'
 */
export interface TuiActionEvent extends AuditEventBase {
  event: "tui.action";
  component: "tui";
  data: {
    action: string;
    detail?: string;
  };
}

export interface TuiErrorEvent extends AuditEventBase {
  event: "tui.error";
  level: "ERROR";
  component: "tui";
  data: {
    error: string;
    context?: string;
  };
}

// ── union ─────────────────────────────────────────────────────────────────────

export type AuditEvent =
  | AppStartupEvent
  | AppShutdownEvent
  | AppErrorEvent
  | AiQueryEvent
  | AiContextInjectEvent
  | AiCompressionEvent
  | AiResponseEvent
  | AiErrorEvent
  | AiSkillLoadedEvent
  | AiSkillsReadyEvent
  | AiSkillSelectedEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | ApiRequestEvent
  | CmdDispatchEvent
  | TuiActionEvent
  | TuiErrorEvent;
