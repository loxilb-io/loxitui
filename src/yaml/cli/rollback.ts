/**
 * CLI command: yaml rollback <rev-NNNN> [--yes] [--dry-run] [--config-dir <dir>]
 *
 * Restores live state to a previous revision snapshot.
 * Shows the rollback plan and requires --yes to execute.
 * Returns exit code 0 on success, 1 on failure.
 */

import { LoxilbApi } from "@/api/index.js";
import { loadConfig } from "@/config/index.js";
import { rollbackToRevision } from "../versioning/rollback.js";
import type { CliResult } from "./types.js";

// Import adapters to ensure registration
import "../adapters/index.js";

/**
 * Parse CLI flags from args array.
 */
function parseFlags(args: string[]) {
  const flags = {
    revisionId: undefined as string | undefined,
    yes: false,
    dryRun: false,
    configDir: undefined as string | undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--config-dir" && i + 1 < args.length) {
      flags.configDir = args[++i];
    } else if (!arg.startsWith("--") && !arg.startsWith("-")) {
      flags.revisionId = arg;
    }
  }

  return flags;
}

/**
 * Run the rollback CLI command.
 * @returns Exit code (0 = success, 1 = failure)
 */
export async function runRollbackCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  const flags = parseFlags(args);

  if (flags.help) {
    if (jsonMode) {
      return { exitCode: 0, data: { help: true } };
    }
    console.log("Usage: yaml rollback <rev-NNNN> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --yes, -y           Auto-confirm rollback");
    console.log("  --dry-run           Show rollback plan without executing");
    console.log("  --config-dir <dir>  Override .loxilb-config location");
    console.log("  --help, -h          Show this help message");
    return 0;
  }

  // Validate revision ID
  if (!flags.revisionId) {
    console.error("Usage: yaml rollback <rev-NNNN> [--yes] [--dry-run]");
    console.error("");
    console.error("Specify a revision ID (e.g., rev-0001).");
    return 1;
  }

  const revPattern = /^rev-\d{4}$/;
  if (!revPattern.test(flags.revisionId)) {
    console.error(`Invalid revision ID: "${flags.revisionId}"`);
    console.error("Expected format: rev-NNNN (e.g., rev-0001)");
    return 1;
  }

  // Build API instance
  let api: LoxilbApi;
  try {
    const config = await loadConfig();
    api = new LoxilbApi({
      host: config.loxilb.host,
      port: config.loxilb.port,
      tls: config.loxilb.tls,
      token: config.loxilb.token,
    });
  } catch {
    console.error("No configuration found. Run 'loxitui setup' first.");
    return 1;
  }

  // Get rollback plan (dry-run first to show plan)
  let result: Awaited<ReturnType<typeof rollbackToRevision>>;
  try {
    result = await rollbackToRevision(flags.revisionId, api, {
      dryRun: true,
      configDir: flags.configDir,
    });
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  // If no changes needed
  if (result.plan.length === 0) {
    console.log("No changes needed. Live state already matches revision.");
    return 0;
  }

  // Display plan
  const creates = result.plan.filter((p) => p.operation === "CREATE");
  const updates = result.plan.filter((p) => p.operation === "UPDATE");
  const deletes = result.plan.filter((p) => p.operation === "DELETE");

  console.log(`\nRollback Plan (restoring to ${flags.revisionId}):`);
  console.log("");

  for (const op of result.plan) {
    const symbol = op.operation === "CREATE" ? "+" : op.operation === "DELETE" ? "-" : "~";
    console.log(`  ${symbol} [${op.operation}] ${op.kind}/${op.name}`);
  }

  console.log("");
  console.log(
    `Plan: ${creates.length} to create, ${updates.length} to update, ${deletes.length} to delete`
  );

  // Dry run check
  if (flags.dryRun) {
    console.log("\nDry run. No changes applied.");
    return 0;
  }

  // Confirmation check
  if (!flags.yes) {
    console.error("\nPass --yes to apply this rollback.");
    return 1;
  }

  // Execute actual rollback
  try {
    const execResult = await rollbackToRevision(flags.revisionId, api, {
      configDir: flags.configDir,
    });

    if (!execResult.report) {
      if (jsonMode) {
        return {
          exitCode: 0,
          data: { revision: flags.revisionId, restored: true, operations: [] },
        };
      }
      console.log("Rollback complete. No changes were needed.");
      return 0;
    }

    if (jsonMode) {
      const exitCode = execResult.report.totalFailed > 0 ? 1 : 0;
      return {
        exitCode,
        data: {
          revision: flags.revisionId,
          restored: execResult.report.totalFailed === 0,
          operations: execResult.report.results.map((r) => ({
            kind: r.kind,
            name: r.name,
            action: r.operation,
            success: r.success,
          })),
        },
      };
    }

    // Print per-operation results
    console.log("\nApplying rollback...\n");

    for (const opResult of execResult.report.results) {
      if (opResult.success) {
        const verb =
          opResult.operation === "CREATE"
            ? "Created"
            : opResult.operation === "UPDATE"
              ? "Updated"
              : "Deleted";
        console.log(
          `  \u2713 ${verb} ${opResult.kind}/${opResult.name} (${opResult.durationMs}ms)`
        );
      } else {
        console.error(`  \u2717 Failed ${opResult.kind}/${opResult.name}: ${opResult.error}`);
      }
    }

    // Summary
    console.log("");
    console.log(
      `Rollback complete. ${execResult.report.totalCreated} created, ${execResult.report.totalUpdated} updated, ` +
        `${execResult.report.totalDeleted} deleted, ${execResult.report.totalFailed} failed.`
    );

    return execResult.report.totalFailed > 0 ? 1 : 0;
  } catch (err) {
    const msg = `Rollback failed: ${err instanceof Error ? err.message : err}`;
    if (jsonMode) {
      return { exitCode: 1, errors: [msg] };
    }
    console.error(msg);
    return 1;
  }
}
