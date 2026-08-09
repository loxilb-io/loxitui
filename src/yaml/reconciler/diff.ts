/**
 * Diff calculator for the reconciliation engine.
 * Compares desired YAML state against live API state and produces DiffResults.
 */

import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapters/adapter-registry.js";
import type { NormalizedResource } from "../adapters/types.js";
import type { YamlResource } from "../types.js";
import type { DiffResult, FieldDiff } from "./types.js";

/**
 * Deep equality comparison for arbitrary values.
 * Sorts object keys before comparing to ensure stable comparison.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Strict equality handles primitives, null, undefined, same references
  if (a === b) return true;

  // null/undefined mismatch
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // Array comparison
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Object comparison
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();

    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
    }
    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Compute field-level diffs between desired and live specs.
 * Returns FieldDiff[] with dot-notation paths for nested objects.
 */
export function computeFieldDiffs(
  desired: Record<string, unknown>,
  live: Record<string, unknown>,
  prefix = ""
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(desired), ...Object.keys(live)]);

  for (const key of allKeys) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const desiredVal = desired[key];
    const liveVal = live[key];

    if (deepEqual(desiredVal, liveVal)) continue;

    // Both are non-null objects (not arrays) — recurse
    if (
      desiredVal !== null &&
      desiredVal !== undefined &&
      liveVal !== null &&
      liveVal !== undefined &&
      typeof desiredVal === "object" &&
      typeof liveVal === "object" &&
      !Array.isArray(desiredVal) &&
      !Array.isArray(liveVal)
    ) {
      diffs.push(
        ...computeFieldDiffs(
          desiredVal as Record<string, unknown>,
          liveVal as Record<string, unknown>,
          fullPath
        )
      );
    } else {
      diffs.push({ path: fullPath, desired: desiredVal, live: liveVal });
    }
  }

  return diffs;
}

/**
 * Calculate diff between desired YAML resources and live API state.
 * Groups resources by kind, fetches live state via adapters, and compares.
 */
export async function calculateDiff(
  desiredResources: YamlResource[],
  api: LoxilbApi
): Promise<DiffResult[]> {
  const results: DiffResult[] = [];

  // Group desired resources by kind
  const byKind = new Map<string, YamlResource[]>();
  for (const resource of desiredResources) {
    const list = byKind.get(resource.kind) ?? [];
    list.push(resource);
    byKind.set(resource.kind, list);
  }

  // Process each kind
  for (const [kind, desired] of byKind) {
    const adapter = adapterRegistry.get(kind);
    if (!adapter) {
      console.warn(`No adapter found for kind "${kind}", skipping diff`);
      continue;
    }

    // Fetch live state
    const liveResult = await adapter.getAll(api);
    if (!liveResult.ok) {
      console.warn(`Failed to fetch live state for kind "${kind}": ${liveResult.error.message}`);
      // Treat as empty live state — all desired become CREATE
      for (const res of desired) {
        const identityKey = adapter.extractIdentityKey(res.spec);
        results.push({
          kind,
          name: res.metadata.name,
          identityKey,
          operation: "CREATE",
          fieldDiffs: [],
          desiredResource: res,
        });
      }
      continue;
    }

    const liveResources = liveResult.data;
    const isSingleton = adapter.metadata.identityFields.length === 0;

    // Build identity key maps
    const liveByKey = new Map<string, NormalizedResource>();
    for (const lr of liveResources) {
      liveByKey.set(lr.identityKey, lr);
    }

    const desiredKeys = new Set<string>();

    // Compare desired against live
    for (const res of desired) {
      const identityKey = adapter.extractIdentityKey(res.spec);
      desiredKeys.add(identityKey);

      const liveResource = liveByKey.get(identityKey);

      if (!liveResource) {
        // Singleton with no live state: still not CREATE, treat as UPDATE
        if (isSingleton && liveResources.length > 0) {
          // Singleton has live data under a different key — compare against first
          const singletonLive = liveResources[0];
          const normalizedDesired = adapter.normalizeGetResponse(adapter.toApiBody(res.spec));
          if (deepEqual(normalizedDesired, singletonLive.spec)) {
            results.push({
              kind,
              name: res.metadata.name,
              identityKey,
              operation: "UNCHANGED",
              fieldDiffs: [],
              desiredResource: res,
              liveSpec: singletonLive.spec,
            });
          } else {
            const fieldDiffs = computeFieldDiffs(
              normalizedDesired as Record<string, unknown>,
              singletonLive.spec
            );
            results.push({
              kind,
              name: res.metadata.name,
              identityKey,
              operation: "UPDATE",
              fieldDiffs,
              desiredResource: res,
              liveSpec: singletonLive.spec,
            });
          }
        } else if (isSingleton) {
          // Singleton with no live state at all — still UPDATE (POST is upsert)
          results.push({
            kind,
            name: res.metadata.name,
            identityKey,
            operation: "UPDATE",
            fieldDiffs: [],
            desiredResource: res,
          });
        } else {
          // Non-singleton, not in live -> CREATE
          results.push({
            kind,
            name: res.metadata.name,
            identityKey,
            operation: "CREATE",
            fieldDiffs: [],
            desiredResource: res,
          });
        }
        continue;
      }

      // Found in live — compare specs
      const normalizedDesired = adapter.normalizeGetResponse(adapter.toApiBody(res.spec));
      if (deepEqual(normalizedDesired, liveResource.spec)) {
        results.push({
          kind,
          name: res.metadata.name,
          identityKey,
          operation: "UNCHANGED",
          fieldDiffs: [],
          desiredResource: res,
          liveSpec: liveResource.spec,
        });
      } else {
        const fieldDiffs = computeFieldDiffs(
          normalizedDesired as Record<string, unknown>,
          liveResource.spec
        );
        results.push({
          kind,
          name: res.metadata.name,
          identityKey,
          operation: "UPDATE",
          fieldDiffs,
          desiredResource: res,
          liveSpec: liveResource.spec,
        });
      }
    }

    // Live resources not in desired -> potential DELETE (prune candidates)
    for (const [liveKey, liveResource] of liveByKey) {
      if (!desiredKeys.has(liveKey) && !isSingleton) {
        results.push({
          kind,
          name: liveKey,
          identityKey: liveKey,
          operation: "DELETE",
          fieldDiffs: [],
          liveSpec: liveResource.spec,
          pruneCandidate: true,
        });
      }
    }
  }

  return results;
}
