/**
 * Type definitions for the reconciliation engine.
 * Used by diff calculator, planner, and executor.
 */

import type { YamlResource } from "../types.js";

/** The type of operation determined by diff comparison */
export type DiffOperation = "CREATE" | "UPDATE" | "DELETE" | "UNCHANGED";

/** A single field-level difference between desired and live state */
export interface FieldDiff {
  path: string;
  desired: unknown;
  live: unknown;
}

/** Result of comparing a single resource between desired and live state */
export interface DiffResult {
  kind: string;
  name: string;
  identityKey: string;
  operation: DiffOperation;
  fieldDiffs: FieldDiff[];
  desiredResource?: YamlResource;
  liveSpec?: Record<string, unknown>;
  pruneCandidate?: boolean;
}

/** An ordered operation ready for execution */
export interface PlannedOperation {
  kind: string;
  name: string;
  identityKey: string;
  operation: DiffOperation;
  resource?: YamlResource;
  liveSpec?: Record<string, unknown>;
  dependencyTier: number;
}

/** Result of executing a single operation */
export interface OperationResult {
  kind: string;
  name: string;
  operation: DiffOperation;
  success: boolean;
  error?: string;
  durationMs: number;
}

/** Summary report of all executed operations */
export interface ExecutionReport {
  results: OperationResult[];
  totalCreated: number;
  totalUpdated: number;
  totalDeleted: number;
  totalFailed: number;
  totalUnchanged: number;
}
