import { describe, test, expect } from 'bun:test';
import { RouteAdapter } from '../../../src/yaml/adapters/network/route.js';
import { IPv4AddressAdapter } from '../../../src/yaml/adapters/network/ipv4-address.js';
import { NeighborAdapter } from '../../../src/yaml/adapters/network/neighbor.js';
import { FdbAdapter } from '../../../src/yaml/adapters/network/fdb.js';
import { VlanAdapter } from '../../../src/yaml/adapters/network/vlan.js';
import { VxlanTunnelAdapter } from '../../../src/yaml/adapters/network/vxlan-tunnel.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';

describe('RouteAdapter', () => {
  const adapter = new RouteAdapter();

  test('kind and metadata', () => {
    expect(adapter.kind).toBe('Route');
    expect(adapter.metadata.identityFields).toEqual(['destinationIPNet']);
  });

  test('extractIdentityKey', () => {
    expect(adapter.extractIdentityKey({ destinationIPNet: '10.0.0.0/8' })).toBe('10.0.0.0/8');
  });

  test('normalizeGetResponse strips protocol', () => {
    const apiItem = { destinationIPNet: '10.0.0.0/8', gateway: '192.168.1.1', protocol: 2 };
    const result = adapter.normalizeGetResponse(apiItem);
    expect(result.destinationIPNet).toBe('10.0.0.0/8');
    expect(result.gateway).toBe('192.168.1.1');
    expect(result.protocol).toBeUndefined();
  });
});

describe('IPv4AddressAdapter', () => {
  const adapter = new IPv4AddressAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('IPv4Address');
    expect(adapter.extractIdentityKey({ ipAddress: '10.0.0.1/24', dev: 'eth0' })).toBe('10.0.0.1/24/eth0');
  });

  test('round-trip', () => {
    const spec = { ipAddress: '192.168.1.1/24', dev: 'eth0' };
    const body = adapter.toApiBody(spec);
    const normalized = adapter.normalizeGetResponse(body);
    expect(normalized.ipAddress).toBe('192.168.1.1/24');
    expect(normalized.dev).toBe('eth0');
  });
});

describe('NeighborAdapter', () => {
  const adapter = new NeighborAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('Neighbor');
    expect(adapter.extractIdentityKey({ ipAddress: '10.0.0.2', dev: 'eth0' })).toBe('10.0.0.2/eth0');
  });

  test('normalizeGetResponse strips state', () => {
    const apiItem = { ipAddress: '10.0.0.2', dev: 'eth0', macAddress: 'aa:bb:cc:dd:ee:ff', state: 'reachable' };
    const result = adapter.normalizeGetResponse(apiItem);
    expect(result.macAddress).toBe('aa:bb:cc:dd:ee:ff');
    expect(result.state).toBeUndefined();
  });
});

describe('FdbAdapter', () => {
  const adapter = new FdbAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('Fdb');
    expect(adapter.extractIdentityKey({ macAddress: 'aa:bb:cc:dd:ee:ff', dev: 'eth0' })).toBe('aa:bb:cc:dd:ee:ff/eth0');
  });
});

describe('VlanAdapter', () => {
  const adapter = new VlanAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('Vlan');
    expect(adapter.extractIdentityKey({ vid: 100 })).toBe('100');
  });
});

describe('VxlanTunnelAdapter', () => {
  const adapter = new VxlanTunnelAdapter();

  test('kind and identity', () => {
    expect(adapter.kind).toBe('VxlanTunnel');
    expect(adapter.extractIdentityKey({ vxlanID: 200 })).toBe('200');
  });
});

describe('Network adapter registration', () => {
  test('all 6 network adapters are registered', () => {
    expect(adapterRegistry.get('Route')).toBeDefined();
    expect(adapterRegistry.get('IPv4Address')).toBeDefined();
    expect(adapterRegistry.get('Neighbor')).toBeDefined();
    expect(adapterRegistry.get('Fdb')).toBeDefined();
    expect(adapterRegistry.get('Vlan')).toBeDefined();
    expect(adapterRegistry.get('VxlanTunnel')).toBeDefined();
  });
});
