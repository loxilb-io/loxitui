/**
 * Config exporter: queries live API state via adapters and serializes
 * resources to domain-organized YAML files.
 *
 * Used by the CLI export command and the versioning snapshot system.
 */

import type { LoxilbApi } from "@/api/index.js";
import { stringify } from "yaml";
import { adapterRegistry } from "../adapters/adapter-registry.js";
import type { NormalizedResource } from "../adapters/types.js";
import { schemaRegistry } from "../schema/registry.js";
import type { YamlResource } from "../types.js";
import type { ExportOptions, ExportResult, ExportedFile } from "./types.js";

/**
 * Convert a NormalizedResource to YamlResource format.
 * Produces the canonical YAML structure: apiVersion, kind, metadata, spec.
 */
export function toYamlResource(kind: string, normalized: NormalizedResource): YamlResource {
  return {
    apiVersion: "v1",
    kind,
    metadata: { name: normalized.identityKey },
    spec: normalized.spec,
  };
}

/**
 * Serialize an array of YamlResources to a YAML string.
 * Multiple resources are separated by '---\n' multi-document separator.
 */
export function serializeResources(resources: YamlResource[]): string {
  if (resources.length === 0) return "";

  return resources.map((r) => stringify(r, { lineWidth: 120 })).join("---\n");
}

/**
 * Export live API resources to YAML, organized by domain group.
 *
 * Iterates all registered adapter kinds (or a filtered subset), fetches
 * live state, converts to YamlResource format, and serializes to YAML strings.
 *
 * Operational kinds are excluded. Errors from individual adapters are collected
 * but do not halt the export.
 */
export async function exportResources(
  api: LoxilbApi,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const files: ExportedFile[] = [];
  const errors: string[] = [];

  // Determine which kinds to export
  const allKinds = options.kind ? [options.kind] : adapterRegistry.allKinds();

  for (const kind of allKinds) {
    // Skip operational kinds
    if (schemaRegistry.isOperational(kind)) {
      continue;
    }

    const adapter = adapterRegistry.get(kind);
    if (!adapter) {
      continue;
    }

    // Fetch live resources
    const result = await adapter.getAll(api);
    if (!result.ok) {
      errors.push(`Failed to fetch ${kind}: ${result.error.message}`);
      continue;
    }

    let resources = result.data;

    // Apply name filter if set
    if (options.name) {
      resources = resources.filter((r) => r.identityKey === options.name);
    }

    // Skip kind if no resources after filtering
    if (resources.length === 0) {
      continue;
    }

    // Convert to YamlResource format
    const yamlResources = resources.map((r) => toYamlResource(kind, r));

    // Serialize to YAML string
    const content = serializeResources(yamlResources);

    // Look up domain group
    const domainGroup = schemaRegistry.lookup(kind)?.domainGroup ?? "system";

    files.push({
      domainGroup,
      kind,
      fileName: `${kind}.yaml`,
      content,
      resourceCount: yamlResources.length,
    });
  }

  const totalResources = files.reduce((sum, f) => sum + f.resourceCount, 0);

  return {
    files,
    totalResources,
    totalKinds: files.length,
    errors,
  };
}
