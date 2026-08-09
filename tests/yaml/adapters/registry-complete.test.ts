import { describe, test, expect } from 'bun:test';
import { RESOURCE_METADATA } from '../../../src/yaml/schema/identity-fields.js';
import { adapterRegistry } from '../../../src/yaml/adapters/index.js';

describe('Adapter Registry Completeness', () => {
  const allKinds = Object.keys(RESOURCE_METADATA);
  const nonOperationalKinds = allKinds.filter(
    (kind) => RESOURCE_METADATA[kind].operational !== true
  );
  const operationalKinds = allKinds.filter(
    (kind) => RESOURCE_METADATA[kind].operational === true
  );

  test('every non-operational kind has a registered adapter', () => {
    const missing: string[] = [];
    for (const kind of nonOperationalKinds) {
      if (!adapterRegistry.get(kind)) {
        missing.push(kind);
      }
    }
    expect(missing).toEqual([]);
  });

  test('operational kinds do NOT have adapters', () => {
    for (const kind of operationalKinds) {
      expect(adapterRegistry.get(kind)).toBeUndefined();
    }
  });

  test('EndpointHostState specifically excluded', () => {
    expect(adapterRegistry.get('EndpointHostState')).toBeUndefined();
  });

  test('registered count matches non-operational kinds', () => {
    expect(adapterRegistry.allKinds().length).toBe(nonOperationalKinds.length);
  });

  test('each adapter kind matches its registry key', () => {
    for (const kind of adapterRegistry.allKinds()) {
      const adapter = adapterRegistry.get(kind);
      expect(adapter).toBeDefined();
      expect(adapter!.kind).toBe(kind);
    }
  });

  test('LoadBalancer adapter is registered and correct', () => {
    const adapter = adapterRegistry.get('LoadBalancer');
    expect(adapter).toBeDefined();
    expect(adapter!.kind).toBe('LoadBalancer');
    expect(adapter!.metadata.apiEndpoint).toBe('/config/loadbalancer');
  });
});
