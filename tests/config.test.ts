import { beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, writeConfig } from "../src/config";
import { DEFAULT_CONFIG } from "../src/config/types";

describe("Config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "loxitui-test-"));
  });

  it("returns defaults when no config file exists", async () => {
    const orig = process.env.LOXILB_CONFIG_PATH;
    process.env.LOXILB_CONFIG_PATH = path.join(tmpDir, "nonexistent", "config.toml");
    try {
      const cfg = await loadConfig();
      expect(cfg.loxilb.host).toBe(DEFAULT_CONFIG.loxilb.host);
      expect(cfg.loxilb.port).toBe(DEFAULT_CONFIG.loxilb.port);
    } finally {
      if (orig !== undefined) {
        process.env.LOXILB_CONFIG_PATH = orig;
      } else {
        delete process.env.LOXILB_CONFIG_PATH;
      }
    }
  });

  it("merges overrides over defaults", async () => {
    const cfg = await loadConfig({
      loxilb: {
        host: "my-host",
        port: DEFAULT_CONFIG.loxilb.port,
        tls: false,
        token: "",
        username: "",
        password: "",
      },
    });
    expect(cfg.loxilb.host).toBe("my-host");
  });

  it("respects LOXILB_CONFIG_PATH env var", async () => {
    const cfgPath = path.join(tmpDir, "env-override.toml");
    await fs.writeFile(cfgPath, '[loxilb]\nhost = "env-host"\nport = 7777\n', "utf-8");
    process.env.LOXILB_CONFIG_PATH = cfgPath;
    try {
      const cfg = await loadConfig();
      expect(cfg.loxilb.host).toBe("env-host");
      expect(cfg.loxilb.port).toBe(7777);
    } finally {
      process.env.LOXILB_CONFIG_PATH = undefined;
    }
  });

  it("round-trips TOML write+read", async () => {
    const cfgPath = path.join(tmpDir, "config.toml");
    const original = {
      ...DEFAULT_CONFIG,
      loxilb: { ...DEFAULT_CONFIG.loxilb, host: "round-trip-host", port: 12345 },
    };
    await writeConfig(cfgPath, original);
    const raw = await fs.readFile(cfgPath, "utf-8");
    expect(raw).toContain("round-trip-host");
    expect(raw).toContain("12345");
  });

  it("parses [audit] section from TOML correctly", async () => {
    const cfgPath = path.join(tmpDir, "audit-config.toml");
    await fs.writeFile(
      cfgPath,
      '[audit]\nenabled = false\nlog_path = "/tmp/tui-audit.log"\nstderr = true\nmax_size_mb = 10\nmax_files = 3\n',
      "utf-8"
    );
    process.env.LOXILB_CONFIG_PATH = cfgPath;
    try {
      const cfg = await loadConfig();
      expect(cfg.audit.enabled).toBe(false);
      expect(cfg.audit.log_path).toBe("/tmp/tui-audit.log");
      expect(cfg.audit.stderr).toBe(true);
      expect(cfg.audit.max_size_mb).toBe(10);
      expect(cfg.audit.max_files).toBe(3);
    } finally {
      delete process.env.LOXILB_CONFIG_PATH;
    }
  });

  it("uses audit defaults when [audit] section is absent", async () => {
    const cfgPath = path.join(tmpDir, "no-audit.toml");
    await fs.writeFile(cfgPath, '[loxilb]\nhost = "localhost"\n', "utf-8");
    process.env.LOXILB_CONFIG_PATH = cfgPath;
    try {
      const cfg = await loadConfig();
      expect(cfg.audit.enabled).toBe(true);
      expect(cfg.audit.log_path).toContain(path.join(".local", "share", "loxitui", "audit.log"));
      expect(cfg.audit.stderr).toBe(false);
    } finally {
      delete process.env.LOXILB_CONFIG_PATH;
    }
  });
});
