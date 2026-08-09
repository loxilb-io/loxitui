import { describe, test, expect } from 'bun:test';
import { IpsecTunnelAdapter } from '../../../src/yaml/adapters/remaining/ipsec-tunnel.js';
import { IpsecCertificateAdapter } from '../../../src/yaml/adapters/remaining/ipsec-certificate.js';
import { IpsecCaCertificateAdapter } from '../../../src/yaml/adapters/remaining/ipsec-ca-certificate.js';
import { IpsecConfigAdapter } from '../../../src/yaml/adapters/remaining/ipsec-config.js';
import { AiApiKeyAdapter } from '../../../src/yaml/adapters/remaining/ai-api-key.js';
import { AiTenantRateLimitAdapter } from '../../../src/yaml/adapters/remaining/ai-tenant-rate-limit.js';
import { BfdAdapter } from '../../../src/yaml/adapters/remaining/bfd.js';
import { PolicyAdapter } from '../../../src/yaml/adapters/remaining/policy.js';
import { MirrorAdapter } from '../../../src/yaml/adapters/remaining/mirror.js';
import { ParamsAdapter } from '../../../src/yaml/adapters/remaining/params.js';
import { CorsAdapter } from '../../../src/yaml/adapters/remaining/cors.js';
import { SniCertificateAdapter } from '../../../src/yaml/adapters/remaining/sni-certificate.js';
import { OpaWatcherAdapter } from '../../../src/yaml/adapters/remaining/opa-watcher.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';

describe('IPsec adapters', () => {
  test('IpsecTunnel identity', () => {
    const adapter = new IpsecTunnelAdapter();
    expect(adapter.kind).toBe('IpsecTunnel');
    expect(adapter.extractIdentityKey({ name: 'tun1' })).toBe('tun1');
  });

  test('IpsecCertificate identity', () => {
    const adapter = new IpsecCertificateAdapter();
    expect(adapter.kind).toBe('IpsecCertificate');
    expect(adapter.extractIdentityKey({ name: 'cert1' })).toBe('cert1');
  });

  test('IpsecCaCertificate identity', () => {
    const adapter = new IpsecCaCertificateAdapter();
    expect(adapter.kind).toBe('IpsecCaCertificate');
    expect(adapter.extractIdentityKey({ name: 'ca1' })).toBe('ca1');
  });

  test('IpsecConfig is singleton', () => {
    const adapter = new IpsecConfigAdapter();
    expect(adapter.kind).toBe('IpsecConfig');
    expect(adapter.extractIdentityKey({ enabled: true })).toBe('IpsecConfig');
  });
});

describe('AI Gateway adapters', () => {
  test('AiApiKey identity', () => {
    const adapter = new AiApiKeyAdapter();
    expect(adapter.kind).toBe('AiApiKey');
    expect(adapter.extractIdentityKey({ tenant_id: 'tenant1', name: 'key1' })).toBe('tenant1/key1');
  });

  test('AiTenantRateLimit identity', () => {
    const adapter = new AiTenantRateLimitAdapter();
    expect(adapter.kind).toBe('AiTenantRateLimit');
    expect(adapter.extractIdentityKey({ tenant_id: 'tenant2' })).toBe('tenant2');
  });
});

describe('Observability adapters', () => {
  test('Bfd identity', () => {
    const adapter = new BfdAdapter();
    expect(adapter.kind).toBe('Bfd');
    expect(adapter.extractIdentityKey({ instance: 'bfd1', remoteIp: '10.0.0.1' })).toBe('bfd1/10.0.0.1');
  });

  test('Policy identity', () => {
    const adapter = new PolicyAdapter();
    expect(adapter.kind).toBe('Policy');
    expect(adapter.extractIdentityKey({ policyIdent: 'pol1' })).toBe('pol1');
  });

  test('Mirror strips info.portNum', () => {
    const adapter = new MirrorAdapter();
    expect(adapter.kind).toBe('Mirror');
    const apiItem = { ident: 'mir1', info: { port: 'eth0', portNum: 5 } };
    const result = adapter.normalizeGetResponse(apiItem);
    const info = result.info as Record<string, unknown>;
    expect(info.port).toBe('eth0');
    expect(info.portNum).toBeUndefined();
  });
});

describe('System adapters', () => {
  test('Params is singleton', () => {
    const adapter = new ParamsAdapter();
    expect(adapter.extractIdentityKey({})).toBe('Params');
  });

  test('Cors is singleton', () => {
    const adapter = new CorsAdapter();
    expect(adapter.extractIdentityKey({})).toBe('Cors');
  });

  test('SniCertificate identity', () => {
    const adapter = new SniCertificateAdapter();
    expect(adapter.extractIdentityKey({ hostname: 'example.com' })).toBe('example.com');
  });

  test('OpaWatcher is singleton', () => {
    const adapter = new OpaWatcherAdapter();
    expect(adapter.extractIdentityKey({})).toBe('OpaWatcher');
  });
});

describe('Remaining adapter registration', () => {
  test('all 13 remaining adapters are registered', () => {
    const kinds = [
      'IpsecTunnel', 'IpsecCertificate', 'IpsecCaCertificate', 'IpsecConfig',
      'AiApiKey', 'AiTenantRateLimit',
      'Bfd', 'Policy', 'Mirror',
      'Params', 'Cors', 'SniCertificate', 'OpaWatcher',
    ];
    for (const kind of kinds) {
      expect(adapterRegistry.get(kind)).toBeDefined();
    }
  });
});
