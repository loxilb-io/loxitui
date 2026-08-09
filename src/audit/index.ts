/**
 * Singleton accessor for AuditLogger.
 *
 * Call initAuditLogger() once at process startup (cli.tsx).
 * All components call getAuditLogger() — it returns a no-op logger
 * before init so unit tests work without setup overhead.
 */
import type { AuditConfig } from "@/config/types";
import { AuditLogger } from "./logger";

export type { AuditEvent } from "./types";
export type { AuditConfig };
export { AuditLogger };

// No-op config used before initAuditLogger() is called
const NOOP_CONFIG: AuditConfig = {
  enabled: false,
  log_path: "",
  stderr: false,
  max_size_mb: 50,
  max_files: 5,
};

let _instance: AuditLogger | null = null;

/**
 * Initialize the global AuditLogger singleton.
 * Must be called before any component emits audit events.
 */
export function initAuditLogger(config: AuditConfig, sessionId: string): AuditLogger {
  _instance = new AuditLogger(config, sessionId);
  return _instance;
}

/**
 * Get the global AuditLogger singleton.
 * Returns a no-op logger if initAuditLogger() has not been called.
 */
export function getAuditLogger(): AuditLogger {
  if (!_instance) {
    // Return a no-op instance — does not crash, discards all events
    return new AuditLogger(NOOP_CONFIG, "00000000");
  }
  return _instance;
}

/** Convenience accessor for the current audit log path (empty string if not initialised). */
export function getAuditLogPath(): string {
  return _instance?.logPath ?? "";
}

/** Convenience accessor for the current session ID (empty string if not initialised). */
export function getAuditSessionId(): string {
  return _instance?.sessionIdFull ?? "";
}
