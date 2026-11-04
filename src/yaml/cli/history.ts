/**
 * CLI command: yaml history [--config-dir <dir>] [--limit <n>]
 *
 * Lists past revision snapshots with timestamp, user, operations, and status.
 * Returns exit code 0.
 */

import { listRevisions } from "../versioning/history.js";
import type { CliResult } from "./types.js";

/**
 * Parse CLI flags from args array.
 */
function parseFlags(args: string[]) {
  const flags = {
    configDir: undefined as string | undefined,
    limit: undefined as number | undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--config-dir" && i + 1 < args.length) {
      flags.configDir = args[++i];
    } else if (arg === "--limit" && i + 1 < args.length) {
      const n = Number.parseInt(args[++i], 10);
      if (!Number.isNaN(n) && n > 0) {
        flags.limit = n;
      }
    }
  }

  return flags;
}

/**
 * Summarize operations array into a compact string.
 * e.g., ["CREATE LoadBalancer/web-lb", "UPDATE Firewall/default"] -> "1 CREATE, 1 UPDATE"
 */
function summarizeOperations(operations: string[]): string {
  const counts: Record<string, number> = {};

  for (const op of operations) {
    const verb = op.split(" ")[0];
    counts[verb] = (counts[verb] ?? 0) + 1;
  }

  return (
    Object.entries(counts)
      .map(([verb, count]) => `${count} ${verb}`)
      .join(", ") || "no operations"
  );
}

/**
 * Run the history CLI command.
 * @returns Exit code (0 = success)
 */
export async function runHistoryCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  const flags = parseFlags(args);

  if (flags.help) {
    if (jsonMode) {
      return { exitCode: 0, data: { help: true } };
    }
    console.log("Usage: yaml history [options]");
    console.log("");
    console.log("Options:");
    console.log("  --config-dir <dir>  Override .loxilb-config location");
    console.log("  --limit <n>         Show only last N revisions");
    console.log("  --help, -h          Show this help message");
    return 0;
  }

  const revisions = listRevisions(flags.configDir);

  if (revisions.length === 0) {
    if (jsonMode) {
      return { exitCode: 0, data: { revisions: [] } };
    }
    console.log("No revision history found.");
    return 0;
  }

  // Apply limit (take last N from sorted array)
  let display = revisions;
  if (flags.limit && flags.limit < revisions.length) {
    display = revisions.slice(revisions.length - flags.limit);
  }

  if (jsonMode) {
    return {
      exitCode: 0,
      data: {
        revisions: display.map((rev) => ({
          id: rev.revisionId,
          timestamp: rev.timestamp,
          operations: rev.operations.length,
          status: rev.status,
        })),
      },
    };
  }

  // Print table
  console.log("Revision History:");
  console.log("");

  // Header
  const header = [
    "REV".padEnd(12),
    "TIMESTAMP".padEnd(22),
    "USER".padEnd(10),
    "OPERATIONS".padEnd(24),
    "STATUS",
  ].join("");
  console.log(header);

  // Rows (newest first for display)
  const displayReversed = [...display].reverse();

  for (const rev of displayReversed) {
    // Truncate timestamp to seconds
    const ts = rev.timestamp.replace(/\.\d{3}Z$/, "Z").slice(0, 19);
    const ops = summarizeOperations(rev.operations);

    const row = [
      rev.revisionId.padEnd(12),
      ts.padEnd(22),
      rev.user.padEnd(10),
      ops.padEnd(24),
      rev.status,
    ].join("");
    console.log(row);
  }

  console.log("");
  console.log(`Total: ${revisions.length} revisions`);

  return 0;
}
