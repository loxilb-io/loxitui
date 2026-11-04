/**
 * Type definitions for the config export system.
 * Used by the exporter and CLI export command.
 */

import type { DomainGroup } from "../types.js";

/** Options for the exportResources function, mapped from CLI flags */
export interface ExportOptions {
  /** Filter to a single resource kind */
  kind?: string;
  /** Filter to a single resource by identity key */
  name?: string;
  /** Output directory for exported YAML files */
  outputDir?: string;
}

/** A single exported YAML file with its domain grouping */
export interface ExportedFile {
  /** Domain group this file belongs to (core, network, security, etc.) */
  domainGroup: DomainGroup;
  /** Resource kind (e.g., LoadBalancer, Firewall) */
  kind: string;
  /** Output filename (e.g., LoadBalancer.yaml) */
  fileName: string;
  /** Serialized YAML content */
  content: string;
  /** Number of resources in this file */
  resourceCount: number;
}

/** Aggregate result from an export operation */
export interface ExportResult {
  /** Exported files organized by domain group */
  files: ExportedFile[];
  /** Total number of resources exported */
  totalResources: number;
  /** Total number of kinds exported */
  totalKinds: number;
  /** Errors encountered during export (non-fatal) */
  errors: string[];
}
