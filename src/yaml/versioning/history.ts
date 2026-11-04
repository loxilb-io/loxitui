/**
 * History management: list revisions, prune old ones, manage version config.
 *
 * Reads and manages the .loxilb-config/revisions/ directory structure.
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveConfigDir } from "./snapshot.js";
import type { RevisionMetadata, SnapshotConfig } from "./types.js";
import { DEFAULT_SNAPSHOT_CONFIG } from "./types.js";

/**
 * List all revisions from the config directory.
 * Returns RevisionMetadata[] sorted by revision ID (oldest first).
 * Returns empty array if revisions directory doesn't exist.
 */
export function listRevisions(configDir?: string): RevisionMetadata[] {
  const dir = resolveConfigDir(configDir);
  const revisionsDir = join(dir, "revisions");

  if (!existsSync(revisionsDir)) {
    return [];
  }

  const entries = readdirSync(revisionsDir, { withFileTypes: true });
  const revPattern = /^rev-\d{4}$/;

  const revisions: RevisionMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !revPattern.test(entry.name)) continue;

    const metadataPath = join(revisionsDir, entry.name, "metadata.json");
    if (!existsSync(metadataPath)) continue;

    try {
      const content = readFileSync(metadataPath, "utf-8");
      const metadata = JSON.parse(content) as RevisionMetadata;
      revisions.push(metadata);
    } catch {
      // Skip malformed metadata
    }
  }

  // Sort by revision ID ascending (oldest first)
  revisions.sort((a, b) => a.revisionId.localeCompare(b.revisionId));

  return revisions;
}

/**
 * Delete oldest revisions when count exceeds maxRevisions.
 * Removes entire revision directories (including YAML and metadata).
 */
export function pruneRevisions(configDir: string, maxRevisions: number): void {
  const revisionsDir = join(configDir, "revisions");

  if (!existsSync(revisionsDir)) return;

  const entries = readdirSync(revisionsDir, { withFileTypes: true });
  const revPattern = /^rev-\d{4}$/;

  const revDirs = entries
    .filter((e) => e.isDirectory() && revPattern.test(e.name))
    .map((e) => e.name)
    .sort(); // Sort ascending (oldest first)

  if (revDirs.length <= maxRevisions) return;

  const toDelete = revDirs.slice(0, revDirs.length - maxRevisions);

  for (const dir of toDelete) {
    rmSync(join(revisionsDir, dir), { recursive: true, force: true });
  }
}

/**
 * Load version config from configDir/config.json.
 * Returns default config if file doesn't exist.
 */
export function loadVersionConfig(configDir: string): SnapshotConfig {
  const configPath = join(configDir, "config.json");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_SNAPSHOT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as SnapshotConfig;
  } catch {
    return { ...DEFAULT_SNAPSHOT_CONFIG };
  }
}

/**
 * Save version config to configDir/config.json.
 */
export function saveVersionConfig(configDir: string, config: SnapshotConfig): void {
  const configPath = join(configDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
