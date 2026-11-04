/**
 * Plan executor: runs planned operations sequentially via resource adapters.
 * Handles CREATE, DELETE, and UPDATE (singleton vs non-singleton) operations.
 */

import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapters/adapter-registry.js";
import type { ResourceAdapter } from "../adapters/types.js";
import type { YamlResource } from "../types.js";
import type { ExecutionReport, OperationResult, PlannedOperation } from "./types.js";

/**
 * Build a minimal YamlResource from a live spec for deletion purposes.
 */
function buildDeleteResource(
  kind: string,
  name: string,
  spec: Record<string, unknown>
): YamlResource {
  return {
    apiVersion: "v1",
    kind,
    metadata: { name },
    spec,
  };
}

/**
 * Execute a list of planned operations sequentially via adapters.
 * Each operation reports success/failure with timing.
 * Continues on failure (does not stop-on-error).
 */
export async function executePlan(
  plan: PlannedOperation[],
  api: LoxilbApi
): Promise<ExecutionReport> {
  // Ensure sorted by dependencyTier
  const sorted = [...plan].sort((a, b) => a.dependencyTier - b.dependencyTier);

  const results: OperationResult[] = [];
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  let totalFailed = 0;
  let totalUnchanged = 0;

  for (const op of sorted) {
    const startTime = performance.now();
    const adapter = adapterRegistry.get(op.kind);

    if (!adapter) {
      const durationMs = Math.round(performance.now() - startTime);
      results.push({
        kind: op.kind,
        name: op.name,
        operation: op.operation,
        success: false,
        error: `No adapter found for kind "${op.kind}"`,
        durationMs,
      });
      totalFailed++;
      continue;
    }

    try {
      switch (op.operation) {
        case "CREATE": {
          const result = await adapter.create(api, op.resource!);
          const durationMs = Math.round(performance.now() - startTime);
          if (result.ok) {
            results.push({
              kind: op.kind,
              name: op.name,
              operation: "CREATE",
              success: true,
              durationMs,
            });
            totalCreated++;
          } else {
            results.push({
              kind: op.kind,
              name: op.name,
              operation: "CREATE",
              success: false,
              error: result.error.message,
              durationMs,
            });
            totalFailed++;
          }
          break;
        }

        case "DELETE": {
          const deleteResource = buildDeleteResource(op.kind, op.name, op.liveSpec ?? {});
          const result = await adapter.delete(api, deleteResource);
          const durationMs = Math.round(performance.now() - startTime);
          if (result.ok) {
            results.push({
              kind: op.kind,
              name: op.name,
              operation: "DELETE",
              success: true,
              durationMs,
            });
            totalDeleted++;
          } else {
            results.push({
              kind: op.kind,
              name: op.name,
              operation: "DELETE",
              success: false,
              error: result.error.message,
              durationMs,
            });
            totalFailed++;
          }
          break;
        }

        case "UPDATE": {
          const isSingleton = adapter.metadata.identityFields.length === 0;

          if (isSingleton) {
            // Singleton: just POST (upsert)
            const result = await adapter.create(api, op.resource!);
            const durationMs = Math.round(performance.now() - startTime);
            if (result.ok) {
              results.push({
                kind: op.kind,
                name: op.name,
                operation: "UPDATE",
                success: true,
                durationMs,
              });
              totalUpdated++;
            } else {
              results.push({
                kind: op.kind,
                name: op.name,
                operation: "UPDATE",
                success: false,
                error: result.error.message,
                durationMs,
              });
              totalFailed++;
            }
          } else {
            // Non-singleton: delete then create
            const deleteResource = buildDeleteResource(op.kind, op.name, op.liveSpec ?? {});
            const deleteResult = await adapter.delete(api, deleteResource);

            if (!deleteResult.ok) {
              const durationMs = Math.round(performance.now() - startTime);
              results.push({
                kind: op.kind,
                name: op.name,
                operation: "UPDATE",
                success: false,
                error: `Delete phase failed: ${deleteResult.error.message}`,
                durationMs,
              });
              totalFailed++;
              break;
            }

            const createResult = await adapter.create(api, op.resource!);
            const durationMs = Math.round(performance.now() - startTime);
            if (createResult.ok) {
              results.push({
                kind: op.kind,
                name: op.name,
                operation: "UPDATE",
                success: true,
                durationMs,
              });
              totalUpdated++;
            } else {
              // CRITICAL: Resource was deleted but re-creation failed
              const msg = `CRITICAL: Resource ${op.kind}/${op.name} was deleted but re-creation failed: ${createResult.error.message}. Original spec: ${JSON.stringify(op.liveSpec)}`;
              console.error(msg);
              results.push({
                kind: op.kind,
                name: op.name,
                operation: "UPDATE",
                success: false,
                error: msg,
                durationMs,
              });
              totalFailed++;
            }
          }
          break;
        }

        case "UNCHANGED": {
          totalUnchanged++;
          break;
        }
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      results.push({
        kind: op.kind,
        name: op.name,
        operation: op.operation,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      });
      totalFailed++;
    }
  }

  return {
    results,
    totalCreated,
    totalUpdated,
    totalDeleted,
    totalFailed,
    totalUnchanged,
  };
}
