import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  LOG_ANALYSIS_MAX_CHARS,
  buildLogAnalysisContext,
  classifyLogLine,
  readLogFile,
  readLogTail,
  resolveLogPath,
} from "../src/utils/log";

describe("Log utilities", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loxitui-log-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readLogTail", () => {
    it("reads last 50 lines from file with 100 lines", () => {
      const filePath = path.join(tmpDir, "test.log");
      const allLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      fs.writeFileSync(filePath, `${allLines.join("\n")}\n`, "utf-8");

      const result = readLogTail(filePath, 50);
      expect(result.error).toBeNull();
      expect(result.lines).toHaveLength(50);
      expect(result.lines[0]).toBe("line 51");
      expect(result.lines[49]).toBe("line 100");
    });

    it("reads all lines when file has fewer than max_lines", () => {
      const filePath = path.join(tmpDir, "short.log");
      fs.writeFileSync(filePath, "line 1\nline 2\nline 3\n", "utf-8");

      const result = readLogTail(filePath, 50);
      expect(result.error).toBeNull();
      expect(result.lines).toHaveLength(3);
    });

    it("truncates lines longer than 200 chars", () => {
      const filePath = path.join(tmpDir, "long.log");
      const longLine = "x".repeat(300);
      fs.writeFileSync(filePath, `${longLine}\n`, "utf-8");

      const result = readLogTail(filePath, 50);
      expect(result.error).toBeNull();
      expect(result.lines[0]?.length).toBe(201); // 200 chars + ellipsis
      expect(result.lines[0]?.endsWith("…")).toBe(true);
    });

    it("returns ENOENT error for missing file", () => {
      const result = readLogTail("/tmp/nonexistent-log-file-xyz.log", 50);
      expect(result.error).toContain("Log file not found");
      expect(result.lines).toHaveLength(0);
    });

    it("handles empty file", () => {
      const filePath = path.join(tmpDir, "empty.log");
      fs.writeFileSync(filePath, "", "utf-8");

      const result = readLogTail(filePath, 50);
      expect(result.error).toBeNull();
      expect(result.lines).toHaveLength(0);
    });
  });

  describe("classifyLogLine", () => {
    it("classifies ERROR lines", () => {
      expect(classifyLogLine("2024-01-01 ERROR something failed")).toBe("error");
      expect(classifyLogLine("FATAL: crash")).toBe("error");
      expect(classifyLogLine("PANIC at disk")).toBe("error");
    });

    it("classifies WARN lines", () => {
      expect(classifyLogLine("2024-01-01 WARN low memory")).toBe("warn");
      expect(classifyLogLine("WARNING: deprecated")).toBe("warn");
    });

    it("classifies normal lines", () => {
      expect(classifyLogLine("2024-01-01 INFO started")).toBe("normal");
      expect(classifyLogLine("just a line")).toBe("normal");
    });
  });

  describe("resolveLogPath", () => {
    it("prefers LOXILB_LOG_PATH env var", () => {
      process.env.LOXILB_LOG_PATH = "/custom/path.log";
      try {
        expect(resolveLogPath("/config/path.log")).toBe("/custom/path.log");
      } finally {
        delete process.env.LOXILB_LOG_PATH;
      }
    });

    it("uses config path when env is not set", () => {
      delete process.env.LOXILB_LOG_PATH;
      expect(resolveLogPath("/config/path.log")).toBe("/config/path.log");
    });

    it("falls back to default when both empty", () => {
      delete process.env.LOXILB_LOG_PATH;
      expect(resolveLogPath("")).toBe("/var/log/loxilb/loxilb.log");
    });
  });

  describe("readLogFile (US-022)", () => {
    it("reads last N lines from large file", async () => {
      const filePath = path.join(tmpDir, "large.log");
      const allLines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
      fs.writeFileSync(filePath, `${allLines.join("\n")}\n`, "utf-8");

      const result = await readLogFile(filePath, 50);
      expect(result.error).toBeUndefined();
      expect(result.lines).toHaveLength(50);
      expect(result.lines[0]).toBe("line 151");
      expect(result.lines[49]).toBe("line 200");
    });

    it("handles missing file gracefully", async () => {
      const result = await readLogFile("/nonexistent");
      expect(result.lines).toHaveLength(0);
      expect(result.error).toContain("Log file not found");
    });

    // Windows has no POSIX mode bits: chmod 0o000 leaves the file readable.
    it.skipIf(process.platform === "win32")("handles EACCES gracefully", async () => {
      const filePath = path.join(tmpDir, "noperm.log");
      fs.writeFileSync(filePath, "some content\n", "utf-8");
      fs.chmodSync(filePath, 0o000);

      const result = await readLogFile(filePath);
      expect(result.lines).toHaveLength(0);
      expect(result.error).toContain("Permission denied");

      // Restore permissions for cleanup
      fs.chmodSync(filePath, 0o644);
    });

    it("truncates long lines at 200 chars", async () => {
      const filePath = path.join(tmpDir, "longline.log");
      const longLine = "A".repeat(300);
      fs.writeFileSync(filePath, `${longLine}\n`, "utf-8");

      const result = await readLogFile(filePath);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
      expect(result.lines[0]?.length).toBeGreaterThanOrEqual(200);
    });

    it("tail semantics: last N of exactly N lines returns all N", async () => {
      const filePath = path.join(tmpDir, "exact50.log");
      const allLines = Array.from({ length: 50 }, (_, i) => `entry ${i + 1}`);
      fs.writeFileSync(filePath, `${allLines.join("\n")}\n`, "utf-8");

      const result = await readLogFile(filePath, 50);
      expect(result.error).toBeUndefined();
      expect(result.lines).toHaveLength(50);
      expect(result.lines[0]).toBe("entry 1");
      expect(result.lines[49]).toBe("entry 50");
    });
  });

  describe("buildLogAnalysisContext", () => {
    it("builds context with [Log Context] header and [Instructions] footer", () => {
      const filePath = path.join(tmpDir, "analysis.log");
      fs.writeFileSync(filePath, "INFO: started\nERROR: disk full\nWARN: low mem\n", "utf-8");

      const ctx = buildLogAnalysisContext(filePath);
      expect(ctx).toContain("[Log Context]");
      expect(ctx).toContain("INFO: started");
      expect(ctx).toContain("ERROR: disk full");
      expect(ctx).toContain("WARN: low mem");
      expect(ctx).toContain("[Instructions] Analyse the above loxilb log");
    });

    it("returns empty string for missing file", () => {
      const ctx = buildLogAnalysisContext("/tmp/nonexistent-log-xyz.log");
      expect(ctx).toBe("");
    });

    it("returns empty string for empty file", () => {
      const filePath = path.join(tmpDir, "empty.log");
      fs.writeFileSync(filePath, "", "utf-8");

      const ctx = buildLogAnalysisContext(filePath);
      expect(ctx).toBe("");
    });

    it("truncates from beginning when lines exceed 4000 chars", () => {
      const filePath = path.join(tmpDir, "big.log");
      // Each line ~50 chars, 100 lines = ~5000 chars total (exceeds 4000)
      const lines = Array.from(
        { length: 100 },
        (_, i) => `2024-01-01T00:00:00Z INFO process ${String(i + 1).padStart(3, "0")} running ok`
      );
      fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");

      const ctx = buildLogAnalysisContext(filePath);
      // The log content between [Log Context] and [Instructions] should be <= 4000 chars
      const logContentMatch = ctx.match(/\[Log Context\]\n([\s\S]*?)\n\n\[Instructions\]/);
      expect(logContentMatch).not.toBeNull();
      const logContent = logContentMatch?.[1]!;
      expect(logContent.length).toBeLessThanOrEqual(LOG_ANALYSIS_MAX_CHARS);

      // Should contain the LAST lines (most recent), not the first
      expect(ctx).toContain("process 100 running ok");
      // First lines should be truncated away
      expect(ctx).not.toContain("process 001 running ok");
    });

    it("keeps all lines when under 4000 chars", () => {
      const filePath = path.join(tmpDir, "small.log");
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
      fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");

      const ctx = buildLogAnalysisContext(filePath);
      expect(ctx).toContain("line 1");
      expect(ctx).toContain("line 10");
    });

    it("reads at most 100 lines even from larger files", () => {
      const filePath = path.join(tmpDir, "huge.log");
      // 200 short lines — only last 100 should be read
      const lines = Array.from({ length: 200 }, (_, i) => `L${i + 1}`);
      fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");

      const ctx = buildLogAnalysisContext(filePath);
      expect(ctx).toContain("L200");
      expect(ctx).toContain("L101");
      expect(ctx).not.toContain("\nL100\n");
    });
  });
});
