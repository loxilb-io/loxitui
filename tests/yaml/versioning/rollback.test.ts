/**
 * Unit tests for the rollback system (src/yaml/versioning/rollback.ts).
 * Tests rollbackToRevision using mock adapters and temp directories.
 */

import { describe, test, expect, mock, beforeEach, afterEach, spyOn, jest } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';

import { rollbackToRevision } from '../../../src/yaml/versioning/rollback.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import { schemaRegistry } from '../../../src/yaml/schema/registry.js';
import * as diffModule from '../../../src/yaml/reconciler/diff.js';
import * as plannerModule from '../../../src/yaml/reconciler/planner.js';
import * as executorModule from '../../../src/yaml/reconciler/executor.js';
import * as snapshotModule from '../../../src/yaml/versioning/snapshot.js';
import type { ResourceMetadata, YamlResource } from '../../../src/yaml/types.js';
import type { ResourceAdapter, NormalizedResource } from '../../../src/yaml/adapters/types.js';
import type { ApiResult } from '../../../src/api/client.js';
import type { LoxilbApi } from '../../../src/api/index.js';
import type { DiffResult, PlannedOperation, ExecutionReport } from '../../../src/yaml/reconciler/types.js';

// --- Mock Helpers ---

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loxilb-rollback-test-'));
  tempDirs.push(dir);
  return dir;
}

function createRevisionWithResources(
  configDir: string,
  revId: string,
  resources: YamlResource[] = [],
): string {
  const revDir = join(configDir, 'revisions', revId);
  mkdirSync(revDir, { recursive: true });

  // Write metadata
  writeFileSync(
    join(revDir, 'metadata.json'),
    JSON.stringify({
      revisionId: revId,
      timestamp: new Date().toISOString(),
      user: 'testuser',
      description: 'test',
      operations: [],
      status: 'pre-apply',
      kindsSnapshot: resources.map((r) => r.kind),
    }),
    'utf-8',
  );

  // Group resources by domain and write YAML files
  const byKind = new Map<string, YamlResource[]>();
  for (const r of resources) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }

  for (const [kind, kindResources] of byKind) {
    const domainDir = join(revDir, 'core');
    mkdirSync(domainDir, { recursive: true });

    const content = kindResources
      .map((r) => stringify(r))
      .join('---\n');
    writeFileSync(join(domainDir, `${kind}.yaml`), content, 'utf-8');
  }

  return revDir;
}

const mockApi = {} as LoxilbApi;

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  tempDirs = [];
  jest.restoreAllMocks();
});

// --- Tests ---

describe('rollbackToRevision', () => {
  test('throws if revision directory does not exist', async () => {
    const configDir = createTempDir();

    await expect(
      rollbackToRevision('rev-9999', mockApi, { configDir, dryRun: true }),
    ).rejects.toThrow('Revision rev-9999 not found');
  });

  test('with dryRun=true returns plan without executing', async () => {
    const configDir = createTempDir();
    const resource: YamlResource = {
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'web-lb' },
      spec: { port: 80 },
    };
    createRevisionWithResources(configDir, 'rev-0001', [resource]);

    const mockPlan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer',
        name: 'web-lb',
        identityKey: 'web-lb',
        operation: 'CREATE',
        resource,
        dependencyTier: 0,
      },
    ];

    // Mock the diff/planner pipeline
    spyOn(diffModule, 'calculateDiff').mockResolvedValue([
      {
        kind: 'LoadBalancer',
        name: 'web-lb',
        identityKey: 'web-lb',
        operation: 'CREATE',
        fieldDiffs: [],
        desiredResource: resource,
      },
    ]);
    spyOn(plannerModule, 'buildExecutionPlan').mockReturnValue(mockPlan);
    const executeSpy = spyOn(executorModule, 'executePlan');

    const result = await rollbackToRevision('rev-0001', mockApi, {
      configDir,
      dryRun: true,
    });

    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].operation).toBe('CREATE');
    expect(result.report).toBeUndefined();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test('calls calculateDiff with snapshot resources and prune=true', async () => {
    const configDir = createTempDir();
    const resource: YamlResource = {
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'web-lb' },
      spec: { port: 80 },
    };
    createRevisionWithResources(configDir, 'rev-0001', [resource]);

    const diffSpy = spyOn(diffModule, 'calculateDiff').mockResolvedValue([]);
    const planSpy = spyOn(plannerModule, 'buildExecutionPlan').mockReturnValue([]);

    await rollbackToRevision('rev-0001', mockApi, { configDir, dryRun: true });

    expect(diffSpy).toHaveBeenCalledTimes(1);
    // First arg should be the snapshot resources (YamlResource[])
    const firstArg = diffSpy.mock.calls[0][0] as YamlResource[];
    expect(firstArg.length).toBeGreaterThan(0);
    expect(firstArg[0].kind).toBe('LoadBalancer');

    expect(planSpy).toHaveBeenCalledTimes(1);
    // Second arg should have prune: true
    const planOptions = planSpy.mock.calls[0][1] as { prune?: boolean };
    expect(planOptions.prune).toBe(true);
  });

  test('creates pre-rollback snapshot before executing', async () => {
    const configDir = createTempDir();
    const resource: YamlResource = {
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'web-lb' },
      spec: { port: 80 },
    };
    createRevisionWithResources(configDir, 'rev-0001', [resource]);

    const mockPlan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer',
        name: 'web-lb',
        identityKey: 'web-lb',
        operation: 'CREATE',
        resource,
        dependencyTier: 0,
      },
    ];

    const mockReport: ExecutionReport = {
      results: [{ kind: 'LoadBalancer', name: 'web-lb', operation: 'CREATE', success: true, durationMs: 10 }],
      totalCreated: 1,
      totalUpdated: 0,
      totalDeleted: 0,
      totalFailed: 0,
      totalUnchanged: 0,
    };

    spyOn(diffModule, 'calculateDiff').mockResolvedValue([]);
    spyOn(plannerModule, 'buildExecutionPlan').mockReturnValue(mockPlan);
    spyOn(executorModule, 'executePlan').mockResolvedValue(mockReport);

    const snapshotSpy = spyOn(snapshotModule, 'createSnapshot').mockResolvedValue({
      revisionId: 'rev-0002',
      timestamp: new Date().toISOString(),
      user: 'testuser',
      description: 'Pre-rollback',
      operations: [],
      status: 'pre-apply',
      kindsSnapshot: [],
    });

    const result = await rollbackToRevision('rev-0001', mockApi, { configDir });

    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    const snapshotOptions = snapshotSpy.mock.calls[0][1];
    expect(snapshotOptions.description).toContain('Pre-rollback');
    expect(snapshotOptions.description).toContain('rev-0001');

    expect(result.report).toBeDefined();
    expect(result.report!.totalCreated).toBe(1);
  });

  test('returns empty report when plan is empty', async () => {
    const configDir = createTempDir();
    createRevisionWithResources(configDir, 'rev-0001', []);

    spyOn(diffModule, 'calculateDiff').mockResolvedValue([]);
    spyOn(plannerModule, 'buildExecutionPlan').mockReturnValue([]);

    const result = await rollbackToRevision('rev-0001', mockApi, { configDir });

    expect(result.plan).toHaveLength(0);
    expect(result.report).toBeDefined();
    expect(result.report!.totalCreated).toBe(0);
    expect(result.report!.totalFailed).toBe(0);
  });
});
