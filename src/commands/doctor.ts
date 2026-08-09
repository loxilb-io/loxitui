import { LoxilbApi } from "@/api";
import { getAuditLogger } from "@/audit";
import { loadConfig } from "@/config";
import type { ValidatedConfig } from "@/config";

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
}

/** Extract a short human-readable reason from a network/fetch error message */
function shortReason(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("connection refused") || lower.includes("econnrefused"))
    return "connection refused";
  if (lower.includes("unable to connect")) return "connection refused";
  if (lower.includes("timeout") || lower.includes("abort")) return "connection timed out";
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) return "host not found";
  if (lower.includes("econnreset")) return "connection reset";
  // Return the original message if no well-known pattern matches, but cap length
  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
}

export async function runDoctor(preloadedConfig?: ValidatedConfig): Promise<void> {
  console.log("\nloxitui doctor\n");

  const checks: CheckResult[] = [];

  // 1. Config load
  try {
    const cfg = preloadedConfig ?? (await loadConfig());
    checks.push({ name: "Config file", ok: true, message: "Loaded successfully" });

    // 2. API connectivity
    const api = new LoxilbApi({
      host: cfg.loxilb.host,
      port: cfg.loxilb.port,
      tls: cfg.loxilb.tls,
      token: cfg.loxilb.token,
    });

    const statusResult = await api.status.processes();
    if (statusResult.ok) {
      checks.push({
        name: "LoxiLB API",
        ok: true,
        message: `Connected to ${cfg.loxilb.host}:${cfg.loxilb.port}`,
      });
    } else {
      const reason =
        statusResult.error.status > 0
          ? `HTTP ${statusResult.error.status} ${statusResult.error.message}`
          : shortReason(statusResult.error.message);
      checks.push({ name: "LoxiLB API", ok: false, message: reason });
    }

    // 3. AI provider check
    const provider = cfg.ai.provider || "claude-cli";
    if (provider === "claude-cli") {
      try {
        const proc = Bun.spawn(["claude", "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = await proc.exited;
        if (exitCode === 0) {
          const version = await new Response(proc.stdout).text();
          checks.push({
            name: "AI provider",
            ok: true,
            message: `claude CLI ${version.trim()}`,
          });
        } else {
          checks.push({
            name: "AI provider",
            ok: false,
            message: "claude CLI found but returned error. Run `claude --version` to debug.",
          });
        }
      } catch {
        checks.push({
          name: "AI provider",
          ok: false,
          message:
            "claude CLI not found in PATH. Install: https://docs.anthropic.com/en/docs/claude-cli",
        });
      }
    } else if (provider === "ollama") {
      const baseUrl = cfg.ai.base_url || "http://localhost:11434";
      try {
        const resp = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (resp.ok) {
          checks.push({
            name: "AI provider",
            ok: true,
            message: `Ollama reachable at ${baseUrl}`,
          });
        } else {
          checks.push({
            name: "AI provider",
            ok: false,
            message: `Ollama HTTP ${resp.status} at ${baseUrl}`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        checks.push({
          name: "AI provider",
          ok: false,
          message: `Ollama unreachable at ${baseUrl}: ${shortReason(msg)}`,
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({ name: "Config file", ok: false, message });
  }

  // Print results
  for (const chk of checks) {
    const tag = chk.ok ? "\x1b[32m[OK]\x1b[0m" : "\x1b[31m[FAILED]\x1b[0m";
    console.log(`  ${chk.name.padEnd(20)} ${tag}  ${chk.message}`);
  }

  // Exit 0 when LoxiLB API is reachable (doctor's primary purpose).
  // AI provider and other warnings do not affect exit code.
  const apiCheckOk = checks.find((c) => c.name === "LoxiLB API")?.ok ?? false;
  const allOk = checks.every((c) => c.ok);
  console.log(
    allOk
      ? "\n  All checks passed!\n"
      : "\n  Some checks failed. Run `loxitui setup` to reconfigure.\n"
  );
  getAuditLogger().log({
    event: "cmd.dispatch",
    component: "cmd",
    data: {
      verb: "doctor",
      resource: "connectivity",
      args_count: 0,
      ok: apiCheckOk,
      message: apiCheckOk ? "api reachable" : "api unreachable",
    },
  });
  process.exit(apiCheckOk ? 0 : 1);
}
