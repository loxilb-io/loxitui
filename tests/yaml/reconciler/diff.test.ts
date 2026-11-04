/**
 * Unit tests for the diff calculator (src/yaml/reconciler/diff.ts).
 * Tests deepEqual, computeFieldDiffs, and calculateDiff using mock adapters.
 */

import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test';
import { deepEqual, computeFieldDiffs, calculateDiff } from '../../../src/yaml/reconciler/diff.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import type { YamlResource, ResourceMetadata } from '../../../src/yaml/types.js';
import type { ResourceAdapter, NormalizedResource } from '../../../src/yaml/adapters/types.js';
import type { ApiResult } from '../../../src/api/client.js';
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
  liveResources: NormalizedResource[],
  metadata?: Partial<ResourceMetadata>,
): ResourceAdapter {
  const meta = createMockMetadata({ kind, ...metadata });
  return {
    kind,
    metadata: meta,
    getAll: mock(() => Promise.resolve({ ok: true, data: liveResources } as ApiResult<NormalizedResource[]>)),
    create: mock(() => Promise.resolve({ ok: true, data: undefined } as ApiResult<void>)),
    delete: mock(() => Promise.resolve({ ok: true, data: undefined } as ApiResult<void>)),
    toApiBody: mock((spec: Record<string, unknown>) => spec),
    normalizeGetResponse: mock((item: Record<string, unknown>) => item),
    extractIdentityKey: mock((spec: Record<string, unknown>) => {
      const fields = meta.identityFields;
      if (fields.length === 0) return kind;
      return fields.map((f: string) => String(spec[f] ?? '')).join('/');
    }),
  };
}

function createYamlResource(kind: string, name: string, spec: Record<string, unknown>): YamlResource {
  return {
    apiVersion: 'v1',
    kind,
    metadata: { name },
    spec,
  };
}

// --- deepEqual Tests ---

describe('deepEqual', () => {
  test('returns true for same primitives', () => {
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(42, 42)).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  test('returns false for different primitives', () => {
    expect(deepEqual('hello', 'world')).toBe(false);
    expect(deepEqual(42, 43)).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
  });

  test('returns false for null vs undefined', () => {
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(undefined, null)).toBe(false);
  });

  test('returns true for same arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([], [])).toBe(true);
  });

  test('returns false for different length arrays', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  test('returns true for nested objects with same content', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });

  test('returns true for objects with differently ordered keys', () => {
    expect(deepEqual({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true);
  });

  test('returns false for nested objects with different values', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  test('returns true for empty objects', () => {
    expect(deepEqual({}, {})).toBe(true);
  });

  test('returns false for different types', () => {
    expect(deepEqual('1', 1)).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });
});

// --- computeFieldDiffs Tests ---

describe('computeFieldDiffs', () => {
  test('returns empty array for identical objects', () => {
    const obj = { a: 1, b: 'hello' };
    expect(computeFieldDiffs(obj, obj)).toEqual([]);
  });

  test('detects changed field', () => {
    const desired = { port: 8080 };
    const live = { port: 80 };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toEqual([{ path: 'port', desired: 8080, live: 80 }]);
  });

  test('detects nested changed field with dot notation', () => {
    const desired = { parent: { child: 'new' } };
    const live = { parent: { child: 'old' } };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toEqual([{ path: 'parent.child', desired: 'new', live: 'old' }]);
  });

  test('detects added field (in desired, not live)', () => {
    const desired = { existing: 1, newField: 'value' };
    const live = { existing: 1 };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toEqual([{ path: 'newField', desired: 'value', live: undefined }]);
  });

  test('detects removed field (in live, not desired)', () => {
    const desired = { existing: 1 };
    const live = { existing: 1, oldField: 'gone' };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toEqual([{ path: 'oldField', desired: undefined, live: 'gone' }]);
  });

  test('detects multiple changes', () => {
    const desired = { a: 1, b: 'new', c: true };
    const live = { a: 2, b: 'old', c: true };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toHaveLength(2);
    expect(diffs).toContainEqual({ path: 'a', desired: 1, live: 2 });
    expect(diffs).toContainEqual({ path: 'b', desired: 'new', live: 'old' });
  });

  test('reports array differences as single diff', () => {
    const desired = { endpoints: [1, 2, 3] };
    const live = { endpoints: [1, 2] };
    const diffs = computeFieldDiffs(desired, live);
    expect(diffs).toEqual([{ path: 'endpoints', desired: [1, 2, 3], live: [1, 2] }]);
  });
});

// --- calculateDiff Tests ---

describe('calculateDiff', () => {
  const mockApi = {} as LoxilbApi;
  let registryGetSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    registryGetSpy = spyOn(adapterRegistry, 'get');
  });

  test('returns CREATE for all desired resources when live is empty', async () => {
    const adapter = createMockAdapter('LoadBalancer', []);
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('LoadBalancer', 'web-lb', {
        externalIpAddress: '10.0.0.1',
        port: 80,
        protocol: 'tcp',
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('CREATE');
    expect(results[0].name).toBe('web-lb');
  });

  test('returns UNCHANGED when desired matches live', async () => {
    const liveSpec = { externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' };
    const adapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: '10.0.0.1/80/tcp', spec: liveSpec },
    ]);
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('LoadBalancer', 'web-lb', {
        externalIpAddress: '10.0.0.1',
        port: 80,
        protocol: 'tcp',
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('UNCHANGED');
    expect(results[0].fieldDiffs).toHaveLength(0);
  });

  test('returns UPDATE with fieldDiffs when specs differ', async () => {
    const liveSpec = { externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' };
    const adapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: '10.0.0.1/80/tcp', spec: liveSpec },
    ]);
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('LoadBalancer', 'web-lb', {
        externalIpAddress: '10.0.0.1',
        port: 80,
        protocol: 'tcp',
        mode: 'fullnat',
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('UPDATE');
    expect(results[0].fieldDiffs.length).toBeGreaterThan(0);
  });

  test('returns DELETE with pruneCandidate for live-only resources', async () => {
    const liveSpec = { externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' };
    const adapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: '10.0.0.1/80/tcp', spec: liveSpec },
    ]);
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('LoadBalancer', 'other-lb', {
        externalIpAddress: '10.0.0.2',
        port: 443,
        protocol: 'tcp',
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    const createResult = results.find((r) => r.operation === 'CREATE');
    const deleteResult = results.find((r) => r.operation === 'DELETE');

    expect(createResult).toBeDefined();
    expect(deleteResult).toBeDefined();
    expect(deleteResult!.pruneCandidate).toBe(true);
    expect(deleteResult!.identityKey).toBe('10.0.0.1/80/tcp');
  });

  test('never produces CREATE for singleton resources', async () => {
    const adapter = createMockAdapter('BgpGlobal', [], { identityFields: [] });
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('BgpGlobal', 'bgp-config', {
        routerId: '10.10.10.1',
        localAs: 65001,
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('UPDATE');
    expect(results[0].operation).not.toBe('CREATE');
  });

  test('handles singleton with existing live state as UNCHANGED', async () => {
    const liveSpec = { routerId: '10.10.10.1', localAs: 65001 };
    const adapter = createMockAdapter(
      'BgpGlobal',
      [{ kind: 'BgpGlobal', identityKey: 'BgpGlobal', spec: liveSpec }],
      { identityFields: [] },
    );
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('BgpGlobal', 'bgp-config', {
        routerId: '10.10.10.1',
        localAs: 65001,
      }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('UNCHANGED');
  });

  test('skips kinds with no adapter (no error)', async () => {
    registryGetSpy.mockReturnValue(undefined);
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const desired = [
      createYamlResource('UnknownKind', 'test', { field: 'value' }),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('idempotency: desired matches live produces all UNCHANGED', async () => {
    const spec1 = { externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' };
    const spec2 = { externalIpAddress: '10.0.0.2', port: 443, protocol: 'tcp' };

    const adapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: '10.0.0.1/80/tcp', spec: spec1 },
      { kind: 'LoadBalancer', identityKey: '10.0.0.2/443/tcp', spec: spec2 },
    ]);
    registryGetSpy.mockReturnValue(adapter);

    const desired = [
      createYamlResource('LoadBalancer', 'web-lb', spec1),
      createYamlResource('LoadBalancer', 'api-lb', spec2),
    ];

    const results = await calculateDiff(desired, mockApi);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.operation === 'UNCHANGED')).toBe(true);
    expect(results.every((r) => r.fieldDiffs.length === 0)).toBe(true);
  });
});
