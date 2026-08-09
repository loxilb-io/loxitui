/**
 * Unit tests for the config exporter (src/yaml/export/exporter.ts).
 * Tests toYamlResource, serializeResources, and exportResources using mock adapters.
 */

import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test';
import { toYamlResource, serializeResources, exportResources } from '../../../src/yaml/export/exporter.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import { schemaRegistry } from '../../../src/yaml/schema/registry.js';
import type { ResourceMetadata } from '../../../src/yaml/types.js';
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

const mockApi = {} as LoxilbApi;

// --- Tests ---

describe('toYamlResource', () => {
  test('converts NormalizedResource to YamlResource with correct shape', () => {
    const normalized: NormalizedResource = {
      kind: 'LoadBalancer',
      identityKey: '10.0.0.1/80/tcp',
      spec: { externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' },
    };

    const result = toYamlResource('LoadBalancer', normalized);

    expect(result.apiVersion).toBe('v1');
    expect(result.kind).toBe('LoadBalancer');
    expect(result.metadata.name).toBe('10.0.0.1/80/tcp');
    expect(result.spec).toEqual({ externalIpAddress: '10.0.0.1', port: 80, protocol: 'tcp' });
    expect(result).not.toHaveProperty('_source');
  });
});

describe('serializeResources', () => {
  test('single resource has no --- separator', () => {
    const resources = [toYamlResource('LoadBalancer', {
      kind: 'LoadBalancer',
      identityKey: 'web-lb',
      spec: { port: 80 },
    })];

    const result = serializeResources(resources);

    expect(result).not.toContain('---');
    expect(result).toContain('apiVersion: v1');
    expect(result).toContain('kind: LoadBalancer');
    expect(result).toContain('name: web-lb');
    expect(result).toContain('port: 80');
  });

  test('multiple resources are separated by ---', () => {
    const resources = [
      toYamlResource('LoadBalancer', {
        kind: 'LoadBalancer',
        identityKey: 'lb-1',
        spec: { port: 80 },
      }),
      toYamlResource('LoadBalancer', {
        kind: 'LoadBalancer',
        identityKey: 'lb-2',
        spec: { port: 443 },
      }),
    ];

    const result = serializeResources(resources);

    expect(result).toContain('---\n');
    expect(result).toContain('name: lb-1');
    expect(result).toContain('name: lb-2');
  });

  test('empty array returns empty string', () => {
    expect(serializeResources([])).toBe('');
  });
});

describe('exportResources', () => {
  let origGet: typeof adapterRegistry.get;
  let origAllKinds: typeof adapterRegistry.allKinds;
  let origLookup: typeof schemaRegistry.lookup;
  let origIsOp: typeof schemaRegistry.isOperational;

  beforeEach(() => {
    origGet = adapterRegistry.get.bind(adapterRegistry);
    origAllKinds = adapterRegistry.allKinds.bind(adapterRegistry);
    origLookup = schemaRegistry.lookup.bind(schemaRegistry);
    origIsOp = schemaRegistry.isOperational.bind(schemaRegistry);
  });

  function mockRegistries(adapters: Record<string, ResourceAdapter>, operational: string[] = []) {
    const kinds = Object.keys(adapters);

    spyOn(adapterRegistry, 'allKinds').mockReturnValue(kinds);
    spyOn(adapterRegistry, 'get').mockImplementation((kind: string) => adapters[kind]);
    spyOn(schemaRegistry, 'isOperational').mockImplementation((kind: string) => operational.includes(kind));
    spyOn(schemaRegistry, 'lookup').mockImplementation((kind: string) => {
      const adapter = adapters[kind];
      if (!adapter) return undefined;
      return {
        ...adapter.metadata,
        jsonSchema: {},
        enumMaps: {},
      };
    });
  }

  test('exports all kinds, skipping operational ones', async () => {
    const lbAdapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: 'web-lb', spec: { port: 80 } },
    ], { domainGroup: 'core' });

    const fwAdapter = createMockAdapter('Firewall', [
      { kind: 'Firewall', identityKey: 'default', spec: { rule: 'allow' } },
    ], { domainGroup: 'security' });

    const statusAdapter = createMockAdapter('Status', [
      { kind: 'Status', identityKey: 'status', spec: {} },
    ], { domainGroup: 'system' });

    mockRegistries(
      { LoadBalancer: lbAdapter, Firewall: fwAdapter, Status: statusAdapter },
      ['Status'],
    );

    const result = await exportResources(mockApi);

    expect(result.totalKinds).toBe(2);
    expect(result.totalResources).toBe(2);
    expect(result.errors).toHaveLength(0);

    const kindNames = result.files.map((f) => f.kind);
    expect(kindNames).toContain('LoadBalancer');
    expect(kindNames).toContain('Firewall');
    expect(kindNames).not.toContain('Status');
  });

  test('filters by --kind', async () => {
    const lbAdapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: 'web-lb', spec: { port: 80 } },
    ], { domainGroup: 'core' });

    const fwAdapter = createMockAdapter('Firewall', [
      { kind: 'Firewall', identityKey: 'default', spec: { rule: 'allow' } },
    ], { domainGroup: 'security' });

    mockRegistries({ LoadBalancer: lbAdapter, Firewall: fwAdapter });

    const result = await exportResources(mockApi, { kind: 'LoadBalancer' });

    expect(result.totalKinds).toBe(1);
    expect(result.files[0].kind).toBe('LoadBalancer');
  });

  test('filters by --name', async () => {
    const lbAdapter = createMockAdapter('LoadBalancer', [
      { kind: 'LoadBalancer', identityKey: 'web-lb', spec: { port: 80 } },
      { kind: 'LoadBalancer', identityKey: 'api-lb', spec: { port: 8080 } },
    ], { domainGroup: 'core' });

    mockRegistries({ LoadBalancer: lbAdapter });

    const result = await exportResources(mockApi, { name: 'web-lb' });

    expect(result.totalResources).toBe(1);
    expect(result.files[0].resourceCount).toBe(1);
    expect(result.files[0].content).toContain('name: web-lb');
    expect(result.files[0].content).not.toContain('name: api-lb');
  });

  test('handles getAll failure gracefully', async () => {
    const failAdapter = createMockAdapter('LoadBalancer', []);
    (failAdapter.getAll as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve({ ok: false, error: { message: 'connection refused', statusCode: 0 } }),
    );

    mockRegistries({ LoadBalancer: failAdapter });

    const result = await exportResources(mockApi);

    expect(result.files).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('connection refused');
  });

  test('skips kinds with no adapter', async () => {
    spyOn(adapterRegistry, 'allKinds').mockReturnValue(['UnknownKind']);
    spyOn(adapterRegistry, 'get').mockReturnValue(undefined);
    spyOn(schemaRegistry, 'isOperational').mockReturnValue(false);

    const result = await exportResources(mockApi);

    expect(result.files).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test('skips kinds with empty results', async () => {
    const emptyAdapter = createMockAdapter('LoadBalancer', [], { domainGroup: 'core' });

    mockRegistries({ LoadBalancer: emptyAdapter });

    const result = await exportResources(mockApi);

    expect(result.files).toHaveLength(0);
    expect(result.totalResources).toBe(0);
  });

  test('exported files have correct domain group and fileName', async () => {
    const fwAdapter = createMockAdapter('Firewall', [
      { kind: 'Firewall', identityKey: 'default', spec: { rule: 'allow' } },
    ], { domainGroup: 'security' });

    mockRegistries({ Firewall: fwAdapter });

    const result = await exportResources(mockApi);

    expect(result.files[0].domainGroup).toBe('security');
    expect(result.files[0].fileName).toBe('Firewall.yaml');
    expect(result.files[0].resourceCount).toBe(1);
  });
});
