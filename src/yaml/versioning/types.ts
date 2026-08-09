/**
 * Type definitions for the version control / snapshot system.
 * Used by snapshot, history, and rollback modules.
 */

/** Metadata stored alongside each revision snapshot */
export interface RevisionMetadata {
  /** Sequential revision ID (e.g., rev-0001) */
  revisionId: string;
  /** ISO 8601 timestamp of when the snapshot was taken */
  timestamp: string;
  /** System user who triggered the snapshot */
  user: string;
  /** Human-readable description of the snapshot context */
  description: string;
  /** List of planned operations (e.g., "CREATE LoadBalancer/web-lb") */
  operations: string[];
  /** Snapshot trigger context */
  status: "pre-apply" | "manual";
  /** Path of the YAML file being applied (if applicable) */
  appliedFile?: string;
  /** List of resource kinds that had data in this snapshot */
  kindsSnapshot: string[];
}

/** Configuration for snapshot retention and behavior */
export interface SnapshotConfig {
  /** Maximum number of revisions to retain (default: 50) */
  maxRevisions: number;
}

/** Default snapshot configuration */
export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  maxRevisions: 50,
};

/** Options passed to createSnapshot */
export interface SnapshotOptions {
  /** Description of what triggered the snapshot */
  description: string;
  /** List of planned operations */
  operations: string[];
  /** Path of the YAML file being applied */
  appliedFile?: string;
  /** Override the config directory (default: CWD/.loxilb-config) */
  configDir?: string;
}
