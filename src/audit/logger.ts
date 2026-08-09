/**
 * AuditLogger — NDJSON file logging with size-based rotation and token redaction.
 *
 * Design decisions:
 * - appendFile is async (fire-and-forget) to avoid blocking the TUI event loop
 * - rotation is synchronous (renameSync/statSync) to avoid race conditions
 * - flush() tracks pending writes for clean CLI exit
 * // WARNING: stderr output may cause visual artifacts in TUI raw-terminal mode. Default is false.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditConfig } from "@/config/types";

/**
 * Loose input type for log() — callers in production code should use AuditEvent
 * for type-safe discrimination. The logger itself just needs event/component/data.
 */
export interface AuditLogInput {
  event: string;
  component: string;
  level?: "INFO" | "WARN" | "ERROR";
  ms?: number;
  data?: Record<string, unknown>;
}

export class AuditLogger {
  private readonly config: AuditConfig;
  private readonly sessionId: string;
  private fileDisabled = false;
  private pendingWrites = 0;
  private flushResolvers: Array<() => void> = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(config: AuditConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;

    if (config.enabled) {
      // Auto-create directory before first write
      try {
        fs.mkdirSync(path.dirname(config.log_path), { recursive: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[audit] cannot create log dir: ${msg}\n`);
        this.fileDisabled = true;
      }
    }
  }

  get logPath(): string {
    return this.config.log_path;
  }

  get sessionIdFull(): string {
    return this.sessionId;
  }

  log(event: AuditLogInput): void {
    if (!this.config.enabled) return;

    const record = {
      ts: new Date().toISOString(),
      level: event.level ?? "INFO",
      session: this.sessionId.slice(0, 8),
      event: event.event,
      component: event.component,
      ms: event.ms,
      data: this.redact(event.data),
    };

    const line = `${JSON.stringify(record)}\n`;

    if (this.config.stderr) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const paddedLevel = record.level.padEnd(5);
      const paddedEvent = record.event.padEnd(15);
      const dataStr = this.formatKeyVals(record.data);
      process.stderr.write(`[AUDIT ${hh}:${mm}:${ss}] ${paddedLevel} ${paddedEvent} ${dataStr}\n`);
    }

    if (this.fileDisabled) return;

    // Synchronous rotation check before async append
    try {
      this.rotateIfNeeded();
    } catch {
      // rotation failure is non-fatal
    }

    this.pendingWrites++;
    this.writeQueue = this.writeQueue.then(
      () =>
        new Promise<void>((resolve) => {
          fs.appendFile(this.config.log_path, line, (err) => {
            if (err) {
              // Silently discard; optionally log to stderr in debug mode
            }
            this.pendingWrites--;
            if (this.pendingWrites === 0) {
              for (const r of this.flushResolvers) r();
              this.flushResolvers = [];
            }
            resolve();
          });
        })
    );
  }

  flush(): Promise<void> {
    if (!this.config.enabled || this.fileDisabled) return Promise.resolve();
    if (this.pendingWrites === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private rotateIfNeeded(): void {
    let size = 0;
    try {
      size = fs.statSync(this.config.log_path).size;
    } catch {
      // ENOENT — file doesn't exist yet, size stays 0
    }

    if (size <= this.config.max_size_mb * 1024 * 1024) return;

    const base = this.config.log_path;
    const maxFiles = this.config.max_files;

    // Delete the oldest file if it exists
    try {
      fs.unlinkSync(`${base}.${maxFiles}`);
    } catch {
      // ignore ENOENT
    }

    // Rotate: audit.log.N-1 → audit.log.N
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = i === 1 ? base : `${base}.${i - 1}`;
      const dst = `${base}.${i}`;
      try {
        fs.renameSync(src === base ? base : src, dst);
      } catch {
        // ignore if source doesn't exist
      }
    }
  }

  private redact(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") {
      return data.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]");
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.redact(item));
    }
    if (typeof data === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (/^(token|api_key|apiKey|authorization)$/i.test(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = this.redact(value);
        }
      }
      return result;
    }
    return data;
  }

  private formatKeyVals(data: unknown): string {
    if (!data || typeof data !== "object" || Array.isArray(data)) return "";
    const entries = Object.entries(data as Record<string, unknown>).slice(0, 3);
    return entries.map(([k, v]) => `${k}=${String(v ?? "")}`).join(" ");
  }
}
