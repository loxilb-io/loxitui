/**
 * Unit tests for the plan executor (src/yaml/reconciler/executor.ts).
 */

import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test';
import { executePlan } from '../../../src/yaml/reconciler/executor.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import type { ResourceAdapter } from '../../../src/yaml/adapters/types.js';
import type { ResourceMetadata, YamlResource } from '../../../src/yaml/types.js';
import type { PlannedOperation } from '../../../src/yaml/reconciler/types.js';
import type { LoxilbApi } from '../../../src/api/index.js';

// --- Mock Helpers ---

function createMockMetadata(overrides: Partial<ResourceMetadata> = {}): ResourceMetadata {
  return {
    kind: 'LoadBalancer',
    definitionName: 'loadbalancer',
    apiEndpoint: '/config/loadbalancer',
    getEndpoint: '/config/loadbalancer/all',
    deletePath: '/config/loadbalancer',
    identityFields: ['externalIpAddress', 'port', 'protocol'],
    domainGroup: 'core',
    hasNestedWrapper: false,
    ...overrides,
  };
}

function createMockAdapter(
  kind: string,
  opts?: {
    metadata?: Partial<ResourceMetadata>;
    createFn?: () => Promise<any>;
    deleteFn?: () => Promise<any>;
  },
): ResourceAdapter {
  const meta = createMockMetadata({ kind, ...opts?.metadata });
  return {
    kind,
    metadata: meta,
    getAll: mock(() => Promise.resolve({ ok: true as const, data: [] as any[] })),
    create: mock(opts?.createFn ?? (() => Promise.resolve({ ok: true as const, data: undefined }))),
    delete: mock(opts?.deleteFn ?? (() => Promise.resolve({ ok: true as const, data: undefined }))),
    toApiBody: mock((spec: Record<string, unknown>) => spec),
    normalizeGetResponse: mock((item: Record<string, unknown>) => item),
    extractIdentityKey: mock((spec: Record<string, unknown>) => `${kind}/test`),
  };
}

function makeResource(kind: string, name: string): YamlResource {
  return { apiVersion: 'v1', kind, metadata: { name }, spec: {} };
}

const mockApi = {} as LoxilbApi;

// --- Tests ---

describe('executePlan', () => {
  let registryGetSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    registryGetSpy = spyOn(adapterRegistry, 'get');
  });

  test('CREATE calls adapter.create and reports success', async () => {
    const adapter = createMockAdapter('LoadBalancer');
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'CREATE', resource: makeResource('LoadBalancer', 'lb1'),
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalCreated).toBe(1);
    expect(report.totalFailed).toBe(0);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].success).toBe(true);
    expect(adapter.create).toHaveBeenCalledTimes(1);
  });

  test('DELETE calls adapter.delete and reports success', async () => {
    const adapter = createMockAdapter('LoadBalancer');
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'DELETE', liveSpec: { port: 80 },
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalDeleted).toBe(1);
    expect(report.totalFailed).toBe(0);
    expect(adapter.delete).toHaveBeenCalledTimes(1);
  });

  test('UPDATE singleton calls only adapter.create (no delete)', async () => {
    const adapter = createMockAdapter('BgpGlobal', {
      metadata: { identityFields: [] },
    });
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'BgpGlobal', name: 'bgp', identityKey: 'bgp',
        operation: 'UPDATE', resource: makeResource('BgpGlobal', 'bgp'),
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalUpdated).toBe(1);
    expect(adapter.create).toHaveBeenCalledTimes(1);
    expect(adapter.delete).toHaveBeenCalledTimes(0);
  });

  test('UPDATE non-singleton calls delete then create', async () => {
    const adapter = createMockAdapter('LoadBalancer');
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'UPDATE',
        resource: makeResource('LoadBalancer', 'lb1'),
        liveSpec: { port: 80 },
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalUpdated).toBe(1);
    expect(adapter.delete).toHaveBeenCalledTimes(1);
    expect(adapter.create).toHaveBeenCalledTimes(1);
  });

  test('UPDATE non-singleton: delete ok but create fails reports failure with original spec', async () => {
    const adapter = createMockAdapter('LoadBalancer', {
      createFn: () => Promise.resolve({
        ok: false,
        error: { status: 500, message: 'Server error', url: '/config/loadbalancer' },
      }),
    });
    registryGetSpy.mockReturnValue(adapter);
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'UPDATE',
        resource: makeResource('LoadBalancer', 'lb1'),
        liveSpec: { port: 80 },
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalFailed).toBe(1);
    expect(report.totalUpdated).toBe(0);
    expect(report.results[0].success).toBe(false);
    expect(report.results[0].error).toContain('CRITICAL');
    expect(report.results[0].error).toContain('"port":80');

    errorSpy.mockRestore();
  });

  test('CREATE failure: adapter.create returns error', async () => {
    const adapter = createMockAdapter('LoadBalancer', {
      createFn: () => Promise.resolve({
        ok: false,
        error: { status: 409, message: 'Already exists', url: '/config/loadbalancer' },
      }),
    });
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'CREATE', resource: makeResource('LoadBalancer', 'lb1'),
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalFailed).toBe(1);
    expect(report.totalCreated).toBe(0);
    expect(report.results[0].error).toContain('Already exists');
  });

  test('ExecutionReport totals match operation outcomes', async () => {
    const adapter = createMockAdapter('LoadBalancer');
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'CREATE', resource: makeResource('LoadBalancer', 'lb1'),
        dependencyTier: 0,
      },
      {
        kind: 'LoadBalancer', name: 'lb2', identityKey: 'lb2',
        operation: 'DELETE', liveSpec: { port: 80 },
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalCreated).toBe(1);
    expect(report.totalDeleted).toBe(1);
    expect(report.totalFailed).toBe(0);
    expect(report.results).toHaveLength(2);
  });

  test('durationMs is positive for each operation', async () => {
    const adapter = createMockAdapter('LoadBalancer');
    registryGetSpy.mockReturnValue(adapter);

    const plan: PlannedOperation[] = [
      {
        kind: 'LoadBalancer', name: 'lb1', identityKey: 'lb1',
        operation: 'CREATE', resource: makeResource('LoadBalancer', 'lb1'),
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('missing adapter reports failure', async () => {
    registryGetSpy.mockReturnValue(undefined);

    const plan: PlannedOperation[] = [
      {
        kind: 'UnknownKind', name: 'test', identityKey: 'test',
        operation: 'CREATE', resource: makeResource('UnknownKind', 'test'),
        dependencyTier: 0,
      },
    ];

    const report = await executePlan(plan, mockApi);
    expect(report.totalFailed).toBe(1);
    expect(report.results[0].error).toContain('No adapter found');
  });
});
