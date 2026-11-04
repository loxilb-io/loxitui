/**
 * Execution planner: converts DiffResults into ordered PlannedOperations
 * respecting resource kind dependencies.
 */

import { reverseSort, topologicalSort } from "./dependencies.js";
import type { DiffResult, PlannedOperation } from "./types.js";

export interface PlanOptions {
  prune?: boolean;
}

/**
 * Build an ordered execution plan from diff results.
 *
 * - Filters out UNCHANGED operations
 * - Optionally filters out prune candidate DELETEs
 * - Orders DELETEs in reverse dependency order (dependents first)
 * - Orders CREATEs and UPDATEs in forward dependency order (dependencies first)
 * - DELETEs execute before CREATEs/UPDATEs
 * - Assigns dependencyTier for sequential execution ordering
 */
export function buildExecutionPlan(
  diffResults: DiffResult[],
  options: PlanOptions = {}
): PlannedOperation[] {
  const { prune = false } = options;

  // Filter out UNCHANGED
  let actionable = diffResults.filter((r) => r.operation !== "UNCHANGED");

  // Handle prune filtering
  if (!prune) {
    // Remove all prune candidates
    actionable = actionable.filter((r) => !r.pruneCandidate);
  } else {
    // Keep prune candidate DELETEs only for kinds that appear in non-DELETE desired resources
    const desiredKinds = new Set(
      diffResults
        .filter((r) => r.operation !== "DELETE" && r.operation !== "UNCHANGED")
        .map((r) => r.kind)
    );
    // Also include kinds from UNCHANGED results (they're part of desired)
    for (const r of diffResults) {
      if (r.operation === "UNCHANGED") desiredKinds.add(r.kind);
    }
    actionable = actionable.filter((r) => {
      if (r.pruneCandidate) {
        return desiredKinds.has(r.kind);
      }
      return true;
    });
  }

  // Separate DELETEs from CREATEs/UPDATEs
  const deleteOps = actionable.filter((r) => r.operation === "DELETE");
  const nonDeleteOps = actionable.filter((r) => r.operation !== "DELETE");

  // Get unique kinds for each group
  const deleteKinds = [...new Set(deleteOps.map((r) => r.kind))];
  const nonDeleteKinds = [...new Set(nonDeleteOps.map((r) => r.kind))];

  // Sort kinds by dependency
  const sortedDeleteKinds = deleteKinds.length > 0 ? reverseSort(deleteKinds) : [];
  const sortedNonDeleteKinds = nonDeleteKinds.length > 0 ? topologicalSort(nonDeleteKinds) : [];

  // Build kind -> tier maps
  const deleteTierMap = new Map<string, number>();
  for (let i = 0; i < sortedDeleteKinds.length; i++) {
    deleteTierMap.set(sortedDeleteKinds[i], i);
  }

  const tierOffset = sortedDeleteKinds.length;
  const nonDeleteTierMap = new Map<string, number>();
  for (let i = 0; i < sortedNonDeleteKinds.length; i++) {
    nonDeleteTierMap.set(sortedNonDeleteKinds[i], tierOffset + i);
  }

  // Build PlannedOperations
  const planned: PlannedOperation[] = [];

  for (const op of deleteOps) {
    planned.push({
      kind: op.kind,
      name: op.name,
      identityKey: op.identityKey,
      operation: op.operation,
      liveSpec: op.liveSpec,
      dependencyTier: deleteTierMap.get(op.kind) ?? 0,
    });
  }

  for (const op of nonDeleteOps) {
    planned.push({
      kind: op.kind,
      name: op.name,
      identityKey: op.identityKey,
      operation: op.operation,
      resource: op.desiredResource,
      liveSpec: op.liveSpec,
      dependencyTier: nonDeleteTierMap.get(op.kind) ?? tierOffset,
    });
  }

  // Sort by dependencyTier, then kind, then name
  planned.sort((a, b) => {
    if (a.dependencyTier !== b.dependencyTier) return a.dependencyTier - b.dependencyTier;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });

  return planned;
}
