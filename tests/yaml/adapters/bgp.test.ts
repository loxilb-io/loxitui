import { describe, test, expect } from 'bun:test';
import { BgpGlobalAdapter } from '../../../src/yaml/adapters/bgp/bgp-global.js';
import { BgpNeighborAdapter } from '../../../src/yaml/adapters/bgp/bgp-neighbor.js';
import { BgpPolicyDefinedSetAdapter } from '../../../src/yaml/adapters/bgp/bgp-policy-defined-set.js';
import { BgpPolicyDefinitionAdapter } from '../../../src/yaml/adapters/bgp/bgp-policy-definition.js';
import { BgpPolicyApplyAdapter } from '../../../src/yaml/adapters/bgp/bgp-policy-apply.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';

describe('BgpGlobalAdapter', () => {
  const adapter = new BgpGlobalAdapter();

  test('kind and singleton identity', () => {
    expect(adapter.kind).toBe('BgpGlobal');
    expect(adapter.extractIdentityKey({ localAs: 65000, routerId: '1.1.1.1' })).toBe('BgpGlobal');
  });

  test('round-trip', () => {
    const spec = { localAs: 65000, routerId: '1.1.1.1' };
    const body = adapter.toApiBody(spec);
    const normalized = adapter.normalizeGetResponse(body);
    expect(normalized.localAs).toBe(65000);
    expect(normalized.routerId).toBe('1.1.1.1');
  });
});

describe('BgpNeighborAdapter', () => {
  const adapter = new BgpNeighborAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('BgpNeighbor');
    expect(adapter.extractIdentityKey({ ipAddress: '10.0.0.1' })).toBe('10.0.0.1');
  });

  test('normalizeGetResponse strips state and updowntime', () => {
    const apiItem = {
      ipAddress: '10.0.0.1',
      remoteAs: 65001,
      state: 'established',
      updowntime: '3d 5h 20m',
    };
    const result = adapter.normalizeGetResponse(apiItem);
    expect(result.ipAddress).toBe('10.0.0.1');
    expect(result.remoteAs).toBe(65001);
    expect(result.state).toBeUndefined();
    expect(result.updowntime).toBeUndefined();
  });
});

describe('BgpPolicyDefinedSetAdapter', () => {
  const adapter = new BgpPolicyDefinedSetAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('BgpPolicyDefinedSet');
    expect(adapter.extractIdentityKey({ type: 'community', name: 'my-set' })).toBe('community/my-set');
  });

  test('round-trip', () => {
    const spec = { name: 'my-community', type: 'community', list: ['65000:100'] };
    const body = adapter.toApiBody(spec);
    // type is a path parameter — stripped from the POST body
    expect(body.type).toBeUndefined();
    const normalized = adapter.normalizeGetResponse(body);
    expect(normalized.name).toBe('my-community');
  });
});

describe('BgpPolicyDefinitionAdapter', () => {
  const adapter = new BgpPolicyDefinitionAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('BgpPolicyDefinition');
    expect(adapter.extractIdentityKey({ name: 'my-policy' })).toBe('my-policy');
  });
});

describe('BgpPolicyApplyAdapter', () => {
  const adapter = new BgpPolicyApplyAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('BgpPolicyApply');
    expect(adapter.extractIdentityKey({ ipAddress: '10.0.0.1', policyType: 'import' })).toBe('10.0.0.1/import');
  });
});

describe('BGP adapter registration', () => {
  test('all 5 BGP adapters are registered', () => {
    expect(adapterRegistry.get('BgpGlobal')).toBeDefined();
    expect(adapterRegistry.get('BgpNeighbor')).toBeDefined();
    expect(adapterRegistry.get('BgpPolicyDefinedSet')).toBeDefined();
    expect(adapterRegistry.get('BgpPolicyDefinition')).toBeDefined();
    expect(adapterRegistry.get('BgpPolicyApply')).toBeDefined();
  });
});
