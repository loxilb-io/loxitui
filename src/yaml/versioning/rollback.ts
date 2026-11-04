/**
 * Rollback: restores live state to a previous revision snapshot.
 *
 * Loads snapshot resources, diffs against live state with prune semantics,
 * creates a pre-rollback snapshot for reversibility, then applies the plan.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import type { LoxilbApi } from "@/api/index.js";
import { calculateDiff } from "../reconciler/diff.js";
import { executePlan } from "../reconciler/executor.js";
import { buildExecutionPlan } from "../reconciler/planner.js";
import type { ExecutionReport, PlannedOperation } from "../reconciler/types.js";
import { createSnapshot, loadSnapshotResources, resolveConfigDir } from "./snapshot.js";

export interface RollbackOptions {
  /** Show plan without executing */
  dryRun?: boolean;
  /** Override the config directory */
  configDir?: string;
}

export interface RollbackResult {
  /** The planned operations for the rollback */
  plan: PlannedOperation[];
  /** Execution report (only present when not dry-run) */
  report?: ExecutionReport;
}

/**
 * Rollback to a specific revision.
 *
 * 1. Load snapshot resources from the revision directory
 * 2. Calculate diff against live state (snapshot = desired, live = current)
 * 3. Build execution plan with prune=true (delete resources not in snapshot)
 * 4. If not dry-run: create pre-rollback snapshot, then execute plan
 *
 * @throws Error if revision directory doesn't exist
 */
export async function rollbackToRevision(
  revisionId: string,
  api: LoxilbApi,
  options: RollbackOptions = {}
): Promise<RollbackResult> {
  const configDir = resolveConfigDir(options.configDir);
  const revisionDir = join(configDir, "revisions", revisionId);

  // Verify revision exists
  if (!existsSync(revisionDir)) {
    throw new Error(`Revision ${revisionId} not found`);
  }

  // Load snapshot resources as desired state
  const snapshotResources = loadSnapshotResources(revisionDir);

  // Calculate diff: snapshot is "desired", live API is "current"
  const diffResults = await calculateDiff(snapshotResources, api);

  // Build plan with prune: resources in live but not in snapshot get deleted
  const plan = buildExecutionPlan(diffResults, { prune: true });

  // If dry-run, return plan without executing
  if (options.dryRun) {
    return { plan };
  }

  // If no changes needed, return empty result
  if (plan.length === 0) {
    return {
      plan,
      report: {
        results: [],
        totalCreated: 0,
        totalUpdated: 0,
        totalDeleted: 0,
        totalFailed: 0,
        totalUnchanged: 0,
      },
    };
  }

  // Create pre-rollback snapshot (so rollback is always reversible)
  try {
    await createSnapshot(api, {
      description: `Pre-rollback snapshot before restoring ${revisionId}`,
      operations: plan.map((p) => `${p.operation} ${p.kind}/${p.name}`),
      configDir: options.configDir,
    });
  } catch (err) {
    console.warn(
      `Warning: Failed to create pre-rollback snapshot: ${err instanceof Error ? err.message : err}`
    );
    console.warn("Proceeding with rollback without backup.");
  }

  // Execute the rollback plan
  const report = await executePlan(plan, api);

  return { plan, report };
}
