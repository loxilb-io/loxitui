import { randomUUID } from "node:crypto";
import { loadSkills } from "@/ai/skills";
import { getAuditLogger, initAuditLogger } from "@/audit";
import { runAsk } from "@/commands/ask";
import { runDoctor } from "@/commands/doctor";
import { runSetup } from "@/commands/setup";
import { runStatus } from "@/commands/status";
import { loadConfig } from "@/config";
import { startMcpServer } from "@/mcp/server";
import { App } from "@/tui/App";
import { AppProvider } from "@/tui/state";
import { runYamlCommand } from "@/yaml/cli/index.js";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`loxitui v${VERSION}

Usage:
  loxitui [command]

Commands:
  (none)         Launch the interactive TUI (default)
  setup          Interactive configuration wizard
  doctor         Check connectivity and configuration
  status         Print live LoxiLB state (--output json for machine-readable)
  ask            Ask the AI assistant a question (headless)
  yaml           Manage YAML configuration (yaml --help for subcommands)
  version        Print version and exit
  help           Print this help

Environment:
  LOXILB_KNOWLEDGE_PATH   Override knowledge base directory
  LOXILB_SKILLS_PATH      Override skills directory

Config file:
  ~/.config/loxitui/config.toml
  (run 'loxitui setup' to create it)
`);
}

async function runTui(): Promise<void> {
  let config: Awaited<ReturnType<typeof loadConfig>> | undefined;
  try {
    config = await loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Config error: ${msg}`);
    console.error("Run 'loxitui setup' to configure.");
    process.exit(1);
  }

  const sessionId = randomUUID();
  initAuditLogger(config.audit, sessionId);
  const t0 = Date.now();
  const audit = getAuditLogger();

  audit.log({
    event: "app.startup",
    component: "app",
    data: {
      version: VERSION,
      provider: config.ai.provider,
      host: config.loxilb.host,
      port: config.loxilb.port,
      token: "[REDACTED]",
    },
  });

  // Pre-load AI skills in background
  void loadSkills();

  const renderer = await createCliRenderer();
  const root = createRoot(renderer);

  function quit(): never {
    audit.log({ event: "app.shutdown", component: "app", data: { uptime_ms: Date.now() - t0 } });
    renderer.destroy();
    process.exit(0);
  }

  // Handle SIGINT/SIGTERM for clean shutdown
  const handleSignal = () => {
    audit.log({ event: "app.shutdown", component: "app", data: { uptime_ms: Date.now() - t0 } });
    renderer.destroy();
    process.exit(0);
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  root.render(
    <AppProvider config={config}>
      <App onQuit={quit} />
    </AppProvider>
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase() ?? "";

  // For CLI subcommands (non-TUI), load config and init audit here once
  // so all components have access to the audit logger immediately.
  // TUI path handles its own init inside runTui().
  if (cmd !== "" && cmd !== "--mcp-server") {
    try {
      const cfg = await loadConfig();
      const sessionId = randomUUID();
      initAuditLogger(cfg.audit, sessionId);
      const t0cli = Date.now();
      const audit = getAuditLogger();

      audit.log({
        event: "app.startup",
        component: "app",
        data: {
          version: VERSION,
          provider: cfg.ai.provider,
          host: cfg.loxilb.host,
          port: cfg.loxilb.port,
          token: "[REDACTED]",
        },
      });

      // Register uncaughtException/unhandledRejection to emit app.error before exiting
      process.once("uncaughtException", async (err: Error) => {
        audit.log({
          event: "app.error",
          level: "ERROR",
          component: "app",
          data: { error: err.message, stack: err.stack },
        });
        audit.log({
          event: "app.shutdown",
          component: "app",
          data: { uptime_ms: Date.now() - t0cli },
        });
        await audit.flush();
        process.exit(1);
      });

      process.once("unhandledRejection", async (reason: unknown) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;
        audit.log({
          event: "app.error",
          level: "ERROR",
          component: "app",
          data: { error: msg, stack },
        });
        audit.log({
          event: "app.shutdown",
          component: "app",
          data: { uptime_ms: Date.now() - t0cli },
        });
        await audit.flush();
        process.exit(1);
      });

      switch (cmd) {
        case "setup":
          await runSetup();
          break;
        case "doctor":
          await runDoctor(cfg);
          break;
        case "status":
          await runStatus(args.slice(1), cfg);
          break;
        case "ask":
          await runAsk(args.slice(1), cfg);
          break;
        case "yaml": {
          const yamlExit = await runYamlCommand(args.slice(1));
          audit.log({
            event: "app.shutdown",
            component: "app",
            data: { uptime_ms: Date.now() - t0cli },
          });
          await audit.flush();
          process.exit(yamlExit);
          break;
        }
        case "version":
        case "--version":
        case "-v":
          console.log(`loxitui v${VERSION}`);
          break;
        case "help":
        case "--help":
        case "-h":
          printHelp();
          break;
        default:
          console.error(`Unknown command: ${cmd}`);
          printHelp();
          audit.log({
            event: "app.shutdown",
            component: "app",
            data: { uptime_ms: Date.now() - t0cli },
          });
          await audit.flush();
          process.exit(1);
      }

      audit.log({
        event: "app.shutdown",
        component: "app",
        data: { uptime_ms: Date.now() - t0cli },
      });
      await audit.flush();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Config error: ${msg}`);
      process.exit(1);
    }
    return;
  }

  switch (cmd) {
    case "":
      await runTui();
      break;
    case "--mcp-server":
      await startMcpServer();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
