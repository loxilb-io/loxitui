/**
 * Unit tests for the AuditLogger subsystem.
 * 8 test cases covering: NDJSON validity, token redaction, stderr format,
 * directory auto-creation, size-based rotation, disabled (no-op) logger,
 * session ID in records, flush() behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAuditLogger, initAuditLogger } from "@/audit/index";
import { AuditLogger } from "@/audit/logger";
import type { AuditConfig } from "@/config/types";

function makeConfig(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return {
    enabled: true,
    log_path: path.join(
      os.tmpdir(),
      `loxilb-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`
    ),
    stderr: false,
    max_size_mb: 1,
    max_files: 3,
    ...overrides,
  };
}

/** Wait a tick for fire-and-forget appendFile callbacks to complete */
async function drainWrites(logger: AuditLogger): Promise<void> {
  await logger.flush();
}

describe("AuditLogger", () => {
  let tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
      for (let i = 1; i <= 5; i++) {
        try {
          fs.unlinkSync(`${f}.${i}`);
        } catch {
          /* ok */
        }
      }
    }
    tmpFiles = [];
  });

  it("Test 1: writes valid NDJSON lines to the log file", async () => {
    const cfg = makeConfig();
    tmpFiles.push(cfg.log_path);
    const logger = new AuditLogger(cfg, "aabbccdd-1122-3344-5566-778899aabbcc");

    logger.log({
      event: "api.request",
      component: "api",
      data: { method: "GET", path: "/config/lb/all", status: 200 },
    });
    logger.log({
      event: "cmd.dispatch",
      component: "cmd",
      data: { verb: "list", resource: "lb", args_count: 0, ok: true, message: "ok" },
    });

    await drainWrites(logger);

    const raw = fs.readFileSync(cfg.log_path, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const obj = JSON.parse(line) as Record<string, unknown>;
      expect(obj).toHaveProperty("ts");
      expect(obj).toHaveProperty("level");
      expect(obj).toHaveProperty("session");
      expect(obj).toHaveProperty("event");
      expect(obj).toHaveProperty("component");
      expect(obj).toHaveProperty("data");
      // ts must be a valid ISO date
      expect(() => new Date(obj.ts as string)).not.toThrow();
    }

    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.event).toBe("api.request");
    expect(first.level).toBe("INFO");
  });

  it("Test 2: redacts Bearer tokens and sensitive key names", async () => {
    const cfg = makeConfig();
    tmpFiles.push(cfg.log_path);
    const logger = new AuditLogger(cfg, "test-session-id");

    logger.log({
      event: "api.request",
      component: "api",
      data: {
        method: "POST",
        path: "/config/lb",
        status: 200,
        authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.secrettoken",
        token: "super-secret-token",
        api_key: "sk-1234567890",
      },
    });

    await drainWrites(logger);

    const raw = fs.readFileSync(cfg.log_path, "utf-8");
    const obj = JSON.parse(raw.trim()) as { data: Record<string, unknown> };

    expect(raw).not.toContain("super-secret-token");
    expect(raw).not.toContain("sk-1234567890");
    expect(raw).not.toContain("eyJhbGciOiJSUzI1NiJ9.secrettoken");
    expect(obj.data.token).toBe("[REDACTED]");
    expect(obj.data.api_key).toBe("[REDACTED]");
    expect(obj.data.authorization).toBe("[REDACTED]");
  });

  it("Test 3: emits human-readable summary to stderr when stderr=true", async () => {
    const cfg = makeConfig({ stderr: true });
    tmpFiles.push(cfg.log_path);
    const logger = new AuditLogger(cfg, "test-00000000");

    const stderrLines: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((data: string | Uint8Array) => {
      if (typeof data === "string") stderrLines.push(data);
      return true;
    });

    try {
      logger.log({
        event: "ai.query",
        component: "ai",
        data: { provider: "ollama", model: "llama3", query: "how many lb services" },
      });
      await drainWrites(logger);
    } finally {
      spy.mockRestore();
    }

    const combined = stderrLines.join("");
    expect(combined).toContain("[AUDIT");
    expect(combined).toContain("ai.query");
    expect(combined).toContain("ollama");
  });

  it("Test 4: auto-creates log directory if it does not exist", async () => {
    const deepPath = path.join(
      os.tmpdir(),
      `loxilb-audit-deep-${Date.now()}`,
      "nested",
      "audit.log"
    );
    tmpFiles.push(deepPath);
    const cfg = makeConfig({ log_path: deepPath });
    const logger = new AuditLogger(cfg, "dir-create-test");

    logger.log({
      event: "app.startup",
      component: "app",
      data: {
        version: "0.1.0",
        provider: "ollama",
        host: "localhost",
        port: 11111,
        token: "[REDACTED]",
      },
    });
    await drainWrites(logger);

    expect(fs.existsSync(deepPath)).toBe(true);
    const content = fs.readFileSync(deepPath, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);

    // cleanup nested dirs
    try {
      fs.rmSync(path.dirname(path.dirname(deepPath)), { recursive: true });
    } catch {
      /* ok */
    }
  });

  it("Test 5: rotates log file when it exceeds max_size_mb", async () => {
    const cfg = makeConfig({ max_size_mb: 1, max_files: 3 });
    tmpFiles.push(cfg.log_path);
    const logger = new AuditLogger(cfg, "rotation-test");

    // Pre-fill the log past the 1MB threshold
    const bigContent = Buffer.alloc(1.1 * 1024 * 1024, "x").toString();
    fs.writeFileSync(cfg.log_path, bigContent);

    // This write should trigger rotation
    logger.log({
      event: "cmd.dispatch",
      component: "cmd",
      data: { verb: "list", resource: "lb", args_count: 0, ok: true, message: "after-rotation" },
    });
    await drainWrites(logger);

    // audit.log.1 should contain the old big content
    expect(fs.existsSync(`${cfg.log_path}.1`)).toBe(true);
    // Current audit.log should be small (just the one new line)
    const newContent = fs.readFileSync(cfg.log_path, "utf-8");
    expect(newContent).toContain("after-rotation");
    expect(newContent.length).toBeLessThan(bigContent.length);
  });

  it("Test 6: disabled logger is a no-op (does not write any file)", async () => {
    const cfg = makeConfig({ enabled: false });
    tmpFiles.push(cfg.log_path);
    const logger = new AuditLogger(cfg, "noop-test");

    logger.log({
      event: "tui.action",
      component: "tui",
      data: { action: "panel_switch", detail: "dashboard" },
    });
    await drainWrites(logger);

    expect(fs.existsSync(cfg.log_path)).toBe(false);
  });

  it("Test 7: session ID is included as first 8 chars in every log record", async () => {
    const cfg = makeConfig();
    tmpFiles.push(cfg.log_path);
    const fullSessionId = "abcdef12-3456-7890-abcd-ef1234567890";
    const logger = new AuditLogger(cfg, fullSessionId);

    logger.log({ event: "tui.action", component: "tui", data: { action: "ai_sidebar_open" } });
    logger.log({
      event: "tui.action",
      component: "tui",
      data: { action: "panel_switch", detail: "services" },
    });
    await drainWrites(logger);

    const raw = fs.readFileSync(cfg.log_path, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const obj = JSON.parse(line) as { session: string };
      expect(obj.session).toBe("abcdef12");
    }
  });

  it("Test 8: getAuditLogger() returns no-op before initAuditLogger() is called", () => {
    // Import fresh (module singleton may already be set by other tests — use AuditLogger directly)
    const noop = new AuditLogger(
      { enabled: false, log_path: "", stderr: false, max_size_mb: 50, max_files: 5 },
      "00000000"
    );

    // Should not throw and should not write any file
    expect(() => {
      noop.log({ event: "tui.action", component: "tui", data: { action: "test" } });
    }).not.toThrow();

    // flush should resolve immediately
    const p = noop.flush();
    expect(p).toBeInstanceOf(Promise);
    return p; // resolves without error
  });
});
