/**
 * Snapshot system: captures full live state as domain-organized YAML files
 * under .loxilb-config/revisions/rev-NNNN/ directories.
 *
 * Used by the apply command (pre-apply snapshots) and rollback (loading snapshots).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapters/adapter-registry.js";
import { serializeResources, toYamlResource } from "../export/exporter.js";
import { schemaRegistry } from "../schema/registry.js";
import type { YamlResource } from "../types.js";
import { loadVersionConfig, pruneRevisions } from "./history.js";
import type { RevisionMetadata, SnapshotOptions } from "./types.js";

/**
 * Resolve the config directory path.
 * Defaults to `.loxilb-config` relative to CWD.
 */
export function resolveConfigDir(configDir?: string): string {
  return configDir ?? join(process.cwd(), ".loxilb-config");
}

/**
 * Determine the next sequential revision ID based on existing revisions.
 * Reads the revisions directory and returns rev-NNNN where NNNN is max + 1.
 */
export function getNextRevisionId(configDir: string): string {
  const revisionsDir = join(configDir, "revisions");

  if (!existsSync(revisionsDir)) {
    return "rev-0001";
  }

  const entries = readdirSync(revisionsDir, { withFileTypes: true });
  const revPattern = /^rev-(\d{4})$/;

  let maxNum = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const match = entry.name.match(revPattern);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  return `rev-${String(maxNum + 1).padStart(4, "0")}`;
}

/**
 * Create a full-state snapshot of the live configuration.
 *
 * Iterates all configurable adapter kinds, fetches live state, and writes
 * domain-organized YAML files under a new revision directory.
 */
export async function createSnapshot(
  api: LoxilbApi,
  options: SnapshotOptions
): Promise<RevisionMetadata> {
  const configDir = resolveConfigDir(options.configDir);
  const revisionsDir = join(configDir, "revisions");
  mkdirSync(revisionsDir, { recursive: true });

  const revisionId = getNextRevisionId(configDir);
  const revisionDir = join(revisionsDir, revisionId);
  mkdirSync(revisionDir, { recursive: true });

  const kindsSnapshot: string[] = [];

  // Iterate all configurable kinds
  const allKinds = adapterRegistry.allKinds();

  for (const kind of allKinds) {
    // Skip operational kinds
    if (schemaRegistry.isOperational(kind)) {
      continue;
    }

    const adapter = adapterRegistry.get(kind);
    if (!adapter) continue;

    const result = await adapter.getAll(api);
    if (!result.ok) continue;

    const resources = result.data;
    if (resources.length === 0) continue;

    // Convert and serialize
    const yamlResources = resources.map((r) => toYamlResource(kind, r));
    const content = serializeResources(yamlResources);

    // Look up domain group
    const domainGroup = schemaRegistry.lookup(kind)?.domainGroup ?? "system";

    // Write to domain subdirectory
    const domainDir = join(revisionDir, domainGroup);
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(join(domainDir, `${kind}.yaml`), content, "utf-8");

    kindsSnapshot.push(kind);
  }

  // Build metadata
  let username: string;
  try {
    username = userInfo().username;
  } catch {
    username = "unknown";
  }

  const metadata: RevisionMetadata = {
    revisionId,
    timestamp: new Date().toISOString(),
    user: username,
    description: options.description,
    operations: options.operations,
    status: "pre-apply",
    appliedFile: options.appliedFile,
    kindsSnapshot,
  };

  // Write metadata.json
  writeFileSync(join(revisionDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

  // Prune old revisions
  const config = loadVersionConfig(configDir);
  pruneRevisions(configDir, config.maxRevisions);

  return metadata;
}

/**
 * Load all YAML resources from a snapshot directory.
 *
 * Walks domain subdirectories, reads YAML files, handles multi-document
 * YAML (--- separators), and returns YamlResource[].
 */
export function loadSnapshotResources(revisionDir: string): YamlResource[] {
  const resources: YamlResource[] = [];

  if (!existsSync(revisionDir)) {
    return resources;
  }

  const entries = readdirSync(revisionDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // This is a domain group subdirectory
    const domainDir = join(revisionDir, entry.name);
    const files = readdirSync(domainDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !/\.(yaml|yml)$/i.test(file.name)) continue;

      const content = readFileSync(join(domainDir, file.name), "utf-8");

      // Handle multi-document YAML
      const documents = content.split(/^---\s*$/m).filter((d) => d.trim());

      for (const doc of documents) {
        try {
          const parsed = parseYaml(doc);
          if (parsed && typeof parsed === "object" && "kind" in parsed) {
            resources.push(parsed as YamlResource);
          }
        } catch {
          // Skip malformed documents
        }
      }
    }
  }

  return resources;
}
