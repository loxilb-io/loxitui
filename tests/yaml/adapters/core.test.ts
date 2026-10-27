import { describe, test, expect } from 'bun:test';
import { LoadBalancerAdapter } from '../../../src/yaml/adapters/core/loadbalancer.js';
import { EndpointAdapter } from '../../../src/yaml/adapters/core/endpoint.js';
import { SessionAdapter } from '../../../src/yaml/adapters/core/session.js';
import { HalfCloseAdapter } from '../../../src/yaml/adapters/core/half-close.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import type { LoxilbApi } from '../../../src/api/index.js';

describe('LoadBalancerAdapter', () => {
  const adapter = new LoadBalancerAdapter();

  test('kind and metadata', () => {
    expect(adapter.kind).toBe('LoadBalancer');
    expect(adapter.metadata.hasNestedWrapper).toBe(true);
    expect(adapter.metadata.wrapperField).toBe('serviceArguments');
  });

  test('extractIdentityKey from wrapper', () => {
    const spec = {
      serviceArguments: { externalIP: '10.0.0.1', port: 80, protocol: 'tcp' },
    };
    expect(adapter.extractIdentityKey(spec)).toBe('10.0.0.1/80/tcp');
  });

  test('extractIdentityKey appends model_name only when the rule names one', () => {
    const sa = { externalIP: '10.0.0.1', port: 80, protocol: 'tcp' };
    expect(adapter.extractIdentityKey({ serviceArguments: { ...sa, model_name: '' } })).toBe(
      '10.0.0.1/80/tcp'
    );
    expect(adapter.extractIdentityKey({ serviceArguments: { ...sa, model_name: 'llama3' } })).toBe(
      '10.0.0.1/80/tcp/llama3'
    );
  });

  test('getAll keys rules that share a VIP/port/protocol apart by model_name', async () => {
    const sa = { externalIP: '10.0.0.1', port: 80, protocol: 'tcp' };
    const rules = [
      { serviceArguments: sa, endpoints: [] },
      { serviceArguments: { ...sa, model_name: 'llama3' }, endpoints: [] },
    ];
    const api = { lb: { list: async () => ({ ok: true, data: rules }) } } as unknown as LoxilbApi;
    const result = await adapter.getAll(api);
    expect(result.ok && result.data.map((r) => r.identityKey)).toEqual([
      '10.0.0.1/80/tcp',
      '10.0.0.1/80/tcp/llama3',
    ]);
  });

  test('delete names the model only for a rule that has one', async () => {
    const paths: string[] = [];
    const api = {
      raw: {
        del: async (path: string) => {
          paths.push(path);
          return { ok: true, data: undefined };
        },
      },
    } as unknown as LoxilbApi;
    const lb = (sa: Record<string, unknown>) => ({
      apiVersion: 'v1',
      kind: 'LoadBalancer',
      metadata: { name: 'lb' },
      spec: { serviceArguments: sa },
    });
    const sa = { externalIP: '10.0.0.1', port: 80, protocol: 'tcp' };
    await adapter.delete(api, lb(sa));
    await adapter.delete(api, lb({ ...sa, model_name: 'org/m 1' }));
    expect(paths).toEqual([
      '/config/loadbalancer/externalipaddress/10.0.0.1/port/80/protocol/tcp',
      '/config/loadbalancer/externalipaddress/10.0.0.1/port/80/protocol/tcp?model_name=org%2Fm%201',
    ]);
  });

  test('toApiBody converts string enums to integers', () => {
    const spec = {
      serviceArguments: { externalIP: '10.0.0.1', port: 80, protocol: 'tcp', mode: 'dnat', sel: 'hash' },
    };
    const body = adapter.toApiBody(spec);
    const sa = body.serviceArguments as Record<string, unknown>;
    expect(sa.mode).toBe(0);
    expect(sa.sel).toBe(1);
  });

  test('normalizeGetResponse strips endpoint computed fields and converts enums', () => {
    const apiItem = {
      serviceArguments: { externalIP: '10.0.0.1', port: 80, protocol: 'tcp', mode: 0, sel: 2 },
      endpoints: [
        { hostName: '192.168.1.1', weight: 1, counter: 42, state: 'active' },
        { hostName: '192.168.1.2', weight: 1, counter: 10, state: 'inactive' },
      ],
    };
    const result = adapter.normalizeGetResponse(apiItem);
    const sa = result.serviceArguments as Record<string, unknown>;
    expect(sa.mode).toBe('dnat');
    expect(sa.sel).toBe('wrr');
    const eps = result.endpoints as Record<string, unknown>[];
    expect(eps[0].counter).toBeUndefined();
    expect(eps[0].state).toBeUndefined();
    expect(eps[0].hostName).toBe('192.168.1.1');
    expect(eps[1].counter).toBeUndefined();
  });

  test('normalizeGetResponse strips the read-only *_effective state', () => {
    const result = adapter.normalizeGetResponse({
      serviceArguments: {
        externalIP: '10.0.0.1',
        port: 80,
        protocol: 'tcp',
        half_close_mode: 'hold',
        half_close_effective: { mode: 'hold', source: 'rule' },
        fc_effective: { adaptive: 'off' },
        backend_tls_effective: { status: 'applied' },
      },
    });
    expect(result.serviceArguments).toEqual({
      externalIP: '10.0.0.1',
      port: 80,
      protocol: 'tcp',
      half_close_mode: 'hold',
    });
  });

  test('round-trip: toApiBody -> add computed -> normalizeGetResponse', () => {
    const spec = {
      serviceArguments: { externalIP: '10.0.0.1', port: 80, protocol: 'tcp', mode: 'dnat', sel: 'rr' },
      endpoints: [{ hostName: '192.168.1.1', weight: 1 }],
    };
    const apiBody = adapter.toApiBody(spec);
    // Simulate GET response (add computed fields)
    const getResponse = structuredClone(apiBody);
    const eps = (getResponse.endpoints as Record<string, unknown>[]);
    eps[0].counter = 100;
    eps[0].state = 'active';
    // Normalize back
    const normalized = adapter.normalizeGetResponse(getResponse);
    const nsa = normalized.serviceArguments as Record<string, unknown>;
    expect(nsa.mode).toBe('dnat');
    expect(nsa.sel).toBe('rr');
    const neps = normalized.endpoints as Record<string, unknown>[];
    expect(neps[0].counter).toBeUndefined();
    expect(neps[0].hostName).toBe('192.168.1.1');
  });
});

describe('EndpointAdapter', () => {
  const adapter = new EndpointAdapter();

  test('kind and metadata', () => {
    expect(adapter.kind).toBe('Endpoint');
    expect(adapter.metadata.identityFields).toEqual(['hostName']);
  });

  test('extractIdentityKey', () => {
    expect(adapter.extractIdentityKey({ hostName: 'ep1.example.com' })).toBe('ep1.example.com');
  });

  test('normalizeGetResponse strips computed fields', () => {
    const apiItem = {
      hostName: 'ep1.example.com',
      name: 'ep1',
      currState: 'ok',
      probeDuration: 5,
      inactiveReTries: 3,
      avgDelay: 10,
      minDelay: 2,
      maxDelay: 20,
    };
    const result = adapter.normalizeGetResponse(apiItem);
    expect(result.hostName).toBe('ep1.example.com');
    expect(result.name).toBe('ep1');
    expect(result.currState).toBeUndefined();
    expect(result.probeDuration).toBeUndefined();
    expect(result.inactiveReTries).toBeUndefined();
    expect(result.avgDelay).toBeUndefined();
    expect(result.minDelay).toBeUndefined();
    expect(result.maxDelay).toBeUndefined();
  });
});

describe('SessionAdapter', () => {
  const adapter = new SessionAdapter();

  test('kind and metadata', () => {
    expect(adapter.kind).toBe('Session');
    expect(adapter.metadata.identityFields).toEqual(['ident']);
  });

  test('extractIdentityKey', () => {
    expect(adapter.extractIdentityKey({ ident: 'my-session' })).toBe('my-session');
  });

  test('round-trip with flat spec', () => {
    const spec = { ident: 'sess1', timeout: 300 };
    const body = adapter.toApiBody(spec);
    expect(body.ident).toBe('sess1');
    expect(body.timeout).toBe(300);
    const normalized = adapter.normalizeGetResponse(body);
    expect(normalized.ident).toBe('sess1');
    expect(normalized.timeout).toBe(300);
  });
});

describe('HalfCloseAdapter', () => {
  const adapter = new HalfCloseAdapter();

  test('kind and singleton identity', () => {
    expect(adapter.kind).toBe('HalfClose');
    expect(adapter.extractIdentityKey({ allow: false })).toBe('HalfClose');
  });

  test('getAll reads the settings object as the one live item', async () => {
    const settings = { allow: true, capSeconds: 240, defaultMode: 'off' };
    const api = { raw: { get: async () => ({ ok: true, data: settings }) } } as unknown as LoxilbApi;
    const result = await adapter.getAll(api);
    expect(result.ok && result.data).toEqual([
      { kind: 'HalfClose', identityKey: 'HalfClose', spec: settings },
    ]);
  });

  test('delete is refused (no DELETE declared)', async () => {
    const result = await adapter.delete({} as LoxilbApi, {
      apiVersion: 'v1', kind: 'HalfClose', metadata: { name: 'half-close' }, spec: { allow: true },
    });
    expect(!result.ok && result.error.status).toBe(405);
  });
});

describe('Core adapter registration', () => {
  test('all 4 core adapters are registered', () => {
    expect(adapterRegistry.get('LoadBalancer')).toBeDefined();
    expect(adapterRegistry.get('Endpoint')).toBeDefined();
    expect(adapterRegistry.get('Session')).toBeDefined();
    expect(adapterRegistry.get('HalfClose')).toBeDefined();
  });
});
