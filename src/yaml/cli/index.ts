import { runApplyCommand } from "./apply.js";
import { runDiffCommand } from "./diff.js";
import { runExportCommand } from "./export.js";
import { runHistoryCommand } from "./history.js";
import { runInitCommand } from "./init.js";
import { runRollbackCommand } from "./rollback.js";
import { runValidateCommand } from "./validate.js";

/**
 * Metadata for all yaml subcommands. Single source of truth for help text generation.
 */
export const SUBCOMMANDS = [
  { name: "init", description: "Create a new config directory structure" },
  { name: "validate", description: "Validate YAML files against schema and rules" },
  { name: "apply", description: "Apply YAML configuration to live LoxiLB instance" },
  { name: "diff", description: "Show differences between YAML and live state" },
  { name: "export", description: "Export live configuration as YAML files" },
  { name: "history", description: "List configuration revision history" },
  { name: "rollback", description: "Rollback to a previous configuration revision" },
] as const;

/**
 * Parse and strip --format flag from args.
 */
export function parseFormatFlag(args: string[]): { formatJson: boolean; cleanArgs: string[] } {
  const idx = args.indexOf("--format");
  if (idx !== -1 && args[idx + 1]?.toLowerCase() === "json") {
    const cleanArgs = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { formatJson: true, cleanArgs };
  }
  return { formatJson: false, cleanArgs: args };
}

/**
 * Print help text for the yaml parent command, generated from SUBCOMMANDS metadata.
 */
export function printYamlHelp(): void {
  const maxLen = Math.max(...SUBCOMMANDS.map((s) => s.name.length));
  const lines = SUBCOMMANDS.map((s) => `  ${s.name.padEnd(maxLen + 2)}${s.description}`);

  console.log(`yaml - Manage LoxiLB configuration as YAML

Usage:
  loxitui yaml <subcommand> [options]

Subcommands:
${lines.join("\n")}

Run 'loxitui yaml <subcommand> --help' for subcommand-specific options.

Global Options:
  --format json   Output in JSON format (for CI/CD integration)
`);
}

/**
 * Main dispatcher for all yaml subcommands.
 * Routes to the correct handler based on args[0].
 *
 * @param args - CLI arguments after 'yaml' (e.g., ['validate', 'path/to/file.yaml'])
 * @returns Exit code (0 = success, non-zero = error)
 */
export async function runYamlCommand(args: string[]): Promise<number> {
  // 1. Parse --format json from args
  const { formatJson, cleanArgs } = parseFormatFlag(args);

  // 2. Extract subcommand
  const subcommand = cleanArgs[0]?.toLowerCase() ?? "";
  const subArgs = cleanArgs.slice(1);

  // 3. Route to handler
  let result: number | { exitCode: number; data?: unknown; errors?: string[] };

  switch (subcommand) {
    case "init":
      result = await runInitCommand(subArgs, formatJson);
      break;
    case "validate":
      result = await runValidateCommand(subArgs, formatJson);
      break;
    case "apply":
      result = await runApplyCommand(subArgs, formatJson);
      break;
    case "diff":
      result = await runDiffCommand(subArgs, formatJson);
      break;
    case "export":
      result = await runExportCommand(subArgs, formatJson);
      break;
    case "history":
      result = await runHistoryCommand(subArgs, formatJson);
      break;
    case "rollback":
      result = await runRollbackCommand(subArgs, formatJson);
      break;
    case "help":
    case "--help":
    case "-h":
      printYamlHelp();
      return 0;
    default:
      if (subcommand) {
        console.error(`Unknown subcommand: ${subcommand}`);
      }
      printYamlHelp();
      return 1;
  }

  // 4. Handle JSON output envelope
  if (formatJson) {
    const exitCode = typeof result === "number" ? result : result.exitCode;
    const data = typeof result === "number" ? null : (result.data ?? null);
    const errors = typeof result === "number" ? undefined : result.errors;
    const envelope = {
      success: exitCode === 0,
      exitCode,
      command: subcommand,
      data,
      ...(errors && errors.length > 0 ? { errors } : {}),
    };
    console.log(JSON.stringify(envelope, null, 2));
    return exitCode;
  }

  return typeof result === "number" ? result : result.exitCode;
}
