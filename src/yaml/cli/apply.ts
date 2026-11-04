/**
 * CLI command: yaml apply <path> [--dry-run] [--yes] [--prune] [--values <file>] [--set KEY=VALUE...]
 *
 * Parses, validates, diffs, plans, and applies YAML resources against live API state.
 * Returns exit code 0 if all operations succeed, 1 if any fail.
 */

import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { LoxilbApi } from "@/api/index.js";
import { loadConfig } from "@/config/index.js";
import { loadValuesFile, parseYamlFile } from "../parser.js";
import type { VariableContext } from "../parser.js";
import { calculateDiff } from "../reconciler/diff.js";
import { executePlan } from "../reconciler/executor.js";
import { buildExecutionPlan } from "../reconciler/planner.js";
import type { YamlResource } from "../types.js";
import { validateDirectory, validateFile } from "../validator/index.js";
import { createSnapshot } from "../versioning/snapshot.js";
import type { CliResult } from "./types.js";

// Import adapters to ensure registration
import "../adapters/index.js";

/**
 * Parse CLI flags from args array.
 */
function parseFlags(args: string[]) {
  const flags = {
    dryRun: false,
    yes: false,
    prune: false,
    valuesFile: undefined as string | undefined,
    setOverrides: {} as Record<string, string>,
    path: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if (arg === "--prune") {
      flags.prune = true;
    } else if (arg === "--values" && i + 1 < args.length) {
      flags.valuesFile = args[++i];
    } else if (arg === "--set" && i + 1 < args.length) {
      const setValue = args[++i];
      const eqIdx = setValue.indexOf("=");
      if (eqIdx > 0) {
        flags.setOverrides[setValue.slice(0, eqIdx)] = setValue.slice(eqIdx + 1);
      }
    } else if (!arg.startsWith("--") && !arg.startsWith("-")) {
      flags.path = arg;
    }
  }

  return flags;
}

/**
 * Collect all YAML files from a directory recursively.
 */
function collectYamlFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(yaml|yml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

/**
 * Run the apply CLI command.
 * @returns Exit code (0 = success, 1 = failure)
 */
export async function runApplyCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  const flags = parseFlags(args);

  if (!flags.path) {
    const msg =
      "Usage: yaml apply <path> [--dry-run] [--yes] [--prune] [--values <file>] [--set KEY=VALUE...]";
    if (jsonMode) {
      return { exitCode: 1, errors: [msg] };
    }
    console.error(msg);
    console.error("  <path>              Path to a .yaml/.yml file or directory");
    console.error("  --dry-run           Show plan without executing");
    console.error("  --yes, -y           Auto-confirm (skip prompt)");
    console.error("  --prune             Delete resources in live state not in YAML");
    console.error("  --values <file>     Path to values file for variable substitution");
    console.error("  --set KEY=VALUE     Override variables (can appear multiple times)");
    return 1;
  }

  const targetPath = resolve(flags.path);

  // Build variable context
  const context: VariableContext = {
    setOverrides: flags.setOverrides,
    valuesFile: flags.valuesFile ? loadValuesFile(resolve(flags.valuesFile)) : {},
    env: process.env as Record<string, string | undefined>,
  };

  // Resolve and parse
  let resources: YamlResource[];
  try {
    const stat = statSync(targetPath);

    // Validate first
    if (stat.isDirectory()) {
      const validationResults = validateDirectory(targetPath);
      const hasErrors = validationResults.some(
        (r) => r.parseError || r.resources.some((res) => !res.valid)
      );
      if (hasErrors) {
        console.error("Validation failed. Fix errors before applying.");
        for (const result of validationResults) {
          if (result.parseError) {
            console.error(`  ${result.filePath}: ${result.parseError}`);
          }
          for (const res of result.resources) {
            if (!res.valid) {
              console.error(`  ${res.kind} "${res.resourceName}":`);
              for (const err of res.errors) {
                console.error(`    ${err.fieldPath}: ${err.message}`);
              }
            }
          }
        }
        return 1;
      }

      // Parse all files
      const yamlFiles = collectYamlFiles(targetPath);
      resources = yamlFiles.flatMap((f) => parseYamlFile(f, context));
    } else {
      const validationResult = validateFile(targetPath);
      const hasErrors =
        validationResult.parseError || validationResult.resources.some((res) => !res.valid);
      if (hasErrors) {
        console.error("Validation failed. Fix errors before applying.");
        if (validationResult.parseError) {
          console.error(`  Parse error: ${validationResult.parseError}`);
        }
        for (const res of validationResult.resources) {
          if (!res.valid) {
            console.error(`  ${res.kind} "${res.resourceName}":`);
            for (const err of res.errors) {
              console.error(`    ${err.fieldPath}: ${err.message}`);
            }
          }
        }
        return 1;
      }

      resources = parseYamlFile(targetPath, context);
    }
  } catch (err) {
    console.error(
      `Error: Cannot access path "${targetPath}": ${err instanceof Error ? err.message : err}`
    );
    return 1;
  }

  if (resources.length === 0) {
    console.log("No resources found in the specified path.");
    return 0;
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
  } catch (err) {
    console.error("No configuration found. Run 'loxitui setup' first.");
    return 1;
  }

  // Calculate diff
  const diffResults = await calculateDiff(resources, api);

  // Build execution plan
  const plan = buildExecutionPlan(diffResults, { prune: flags.prune });

  if (plan.length === 0) {
    console.log("No changes. Infrastructure is up-to-date.");
    return 0;
  }

  // Display plan
  const creates = plan.filter((p) => p.operation === "CREATE");
  const updates = plan.filter((p) => p.operation === "UPDATE");
  const deletes = plan.filter((p) => p.operation === "DELETE");

  console.log("\nExecution Plan:");
  console.log("");

  for (const op of plan) {
    const symbol = op.operation === "CREATE" ? "+" : op.operation === "DELETE" ? "-" : "~";
    console.log(`  ${symbol} [${op.operation}] ${op.kind}/${op.name}`);

    // Show field diffs for UPDATEs
    if (op.operation === "UPDATE") {
      const diffResult = diffResults.find(
        (d) => d.kind === op.kind && d.identityKey === op.identityKey
      );
      if (diffResult?.fieldDiffs) {
        for (const fd of diffResult.fieldDiffs) {
          console.log(
            `      ${fd.path}: ${JSON.stringify(fd.live)} -> ${JSON.stringify(fd.desired)}`
          );
        }
      }
    }
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
    console.error("\nPass --yes to apply these changes.");
    return 1;
  }

  // Create pre-apply snapshot
  try {
    const snapshot = await createSnapshot(api, {
      description: `Pre-apply snapshot for ${flags.path}`,
      operations: plan.map((p) => `${p.operation} ${p.kind}/${p.name}`),
      appliedFile: flags.path,
    });
    console.log(`\nSnapshot created: ${snapshot.revisionId}`);
  } catch (snapshotErr) {
    console.warn(
      `\nWarning: Failed to create snapshot: ${snapshotErr instanceof Error ? snapshotErr.message : snapshotErr}`
    );
    console.warn("Proceeding with apply without snapshot backup.");
  }

  // Execute
  if (!jsonMode) {
    console.log("\nApplying changes...\n");
  }
  const report = await executePlan(plan, api);

  if (jsonMode) {
    const exitCode = report.totalFailed > 0 ? 1 : 0;
    return {
      exitCode,
      data: {
        dryRun: false,
        operations: report.results.map((r) => ({
          kind: r.kind,
          name: r.name,
          action: r.operation,
          success: r.success,
          ...(r.error ? { error: r.error } : {}),
        })),
        totalCreated: report.totalCreated,
        totalUpdated: report.totalUpdated,
        totalDeleted: report.totalDeleted,
        totalFailed: report.totalFailed,
      },
    };
  }

  // Print per-operation results
  for (const result of report.results) {
    if (result.success) {
      const verb =
        result.operation === "CREATE"
          ? "Created"
          : result.operation === "UPDATE"
            ? "Updated"
            : "Deleted";
      console.log(`  \u2713 ${verb} ${result.kind}/${result.name} (${result.durationMs}ms)`);
    } else {
      console.error(`  \u2717 Failed ${result.kind}/${result.name}: ${result.error}`);
    }
  }

  // Summary
  console.log("");
  console.log(
    `Apply complete. ${report.totalCreated} created, ${report.totalUpdated} updated, ` +
      `${report.totalDeleted} deleted, ${report.totalFailed} failed.`
  );

  return report.totalFailed > 0 ? 1 : 0;
}
