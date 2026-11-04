import { readFileSync } from "node:fs";
import type { LogApi } from "../api/log";

const DEFAULT_LOG_PATH = "/var/log/loxilb/loxilb.log";
const MAX_LINE_WIDTH = 200;

export const LOG_ANALYSIS_MAX_CHARS = 4000;
const LOG_ANALYSIS_LINES = 100;

const LOG_ANALYSIS_INSTRUCTIONS =
  "[Instructions] Analyse the above loxilb log for errors, warnings, or anomalies. Identify root causes and suggest remediation.";

export interface LogReadResult {
  lines: string[];
  error: string | null;
}

/** Resolve log file path: LOXILB_LOG_PATH env > config log_path > default */
export function resolveLogPath(configLogPath: string): string {
  const envPath = process.env.LOXILB_LOG_PATH;
  if (envPath) return envPath;
  if (configLogPath) return configLogPath;
  return DEFAULT_LOG_PATH;
}

/** Read the last `maxLines` lines from a log file, truncating each line at 200 chars. */
export function readLogTail(filePath: string, maxLines: number): LogReadResult {
  try {
    const content = readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    // Remove trailing empty line from final newline
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }
    const tail = allLines.slice(-maxLines);
    const truncated = tail.map((line) =>
      line.length > MAX_LINE_WIDTH ? `${line.slice(0, MAX_LINE_WIDTH)}…` : line
    );
    return { lines: truncated, error: null };
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return { lines: [], error: `Log file not found: ${filePath}` };
    }
    if (nodeErr.code === "EACCES") {
      return { lines: [], error: `Permission denied: ${filePath}` };
    }
    return { lines: [], error: `Error reading log: ${nodeErr.message}` };
  }
}

/**
 * Build a log analysis context string for AI system prompt injection.
 * Reads the last 100 lines, truncates from the beginning if > 4000 chars.
 */
export function buildLogAnalysisContext(logPath: string): string {
  const result = readLogTail(logPath, LOG_ANALYSIS_LINES);
  if (result.error || result.lines.length === 0) {
    return "";
  }

  let lines = result.lines;
  let joined = lines.join("\n");

  // Truncate from the beginning to stay within budget
  while (joined.length > LOG_ANALYSIS_MAX_CHARS && lines.length > 1) {
    lines = lines.slice(1);
    joined = lines.join("\n");
  }

  return `[Log Context]\n${joined}\n\n${LOG_ANALYSIS_INSTRUCTIONS}`;
}

/**
 * Async wrapper matching PRD signature:
 * readLogFile(path, maxLines?) → Promise<{lines: string[], error?: string}>
 */
export async function readLogFile(
  filePath: string,
  maxLines = 50
): Promise<{ lines: string[]; error?: string }> {
  const result = readLogTail(filePath, maxLines);
  return result.error ? { lines: result.lines, error: result.error } : { lines: result.lines };
}

/**
 * Build a log analysis context string using the LogApi (fetches logs via the loxilb API).
 * Returns an empty string if no logs are available.
 */
export async function buildLogAnalysisContextFromApi(logApi: LogApi): Promise<string> {
  const result = await logApi.list(LOG_ANALYSIS_LINES);
  if (!result.ok || !result.data || result.data.logs.length === 0) {
    return "";
  }

  let lines = result.data.logs;
  let joined = lines.join("\n");

  // Truncate from the beginning to stay within budget
  while (joined.length > LOG_ANALYSIS_MAX_CHARS && lines.length > 1) {
    lines = lines.slice(1);
    joined = lines.join("\n");
  }

  return `[Log Context]\n${joined}\n\n${LOG_ANALYSIS_INSTRUCTIONS}`;
}

/** Classify a log line for color highlighting */
export function classifyLogLine(line: string): "error" | "warn" | "normal" {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("FATAL") || upper.includes("PANIC")) {
    return "error";
  }
  if (upper.includes("WARN")) {
    return "warn";
  }
  return "normal";
}
