import { describe, test, expect } from 'bun:test';
import { IpsecTunnelAdapter } from '../../../src/yaml/adapters/remaining/ipsec-tunnel.js';
import { IpsecCertificateAdapter } from '../../../src/yaml/adapters/remaining/ipsec-certificate.js';
import { IpsecCaCertificateAdapter } from '../../../src/yaml/adapters/remaining/ipsec-ca-certificate.js';
import { IpsecConfigAdapter } from '../../../src/yaml/adapters/remaining/ipsec-config.js';
import { AiApiKeyAdapter } from '../../../src/yaml/adapters/remaining/ai-api-key.js';
import { AiTenantRateLimitAdapter } from '../../../src/yaml/adapters/remaining/ai-tenant-rate-limit.js';
import { AiUserRateLimitAdapter } from '../../../src/yaml/adapters/remaining/ai-user-rate-limit.js';
import { AiRateLimitDefaultsAdapter } from '../../../src/yaml/adapters/remaining/ai-rate-limit-defaults.js';
import { AiObjectiveAdapter } from '../../../src/yaml/adapters/remaining/ai-objective.js';
import { AiNetIdentityAdapter } from '../../../src/yaml/adapters/remaining/ai-net-identity.js';
import { AiJwtAuthProfileAdapter } from '../../../src/yaml/adapters/remaining/ai-jwt-auth-profile.js';
import { BfdAdapter } from '../../../src/yaml/adapters/remaining/bfd.js';
import { PolicyAdapter } from '../../../src/yaml/adapters/remaining/policy.js';
import { MirrorAdapter } from '../../../src/yaml/adapters/remaining/mirror.js';
import { ParamsAdapter } from '../../../src/yaml/adapters/remaining/params.js';
import { CorsAdapter } from '../../../src/yaml/adapters/remaining/cors.js';
import { SniCertificateAdapter } from '../../../src/yaml/adapters/remaining/sni-certificate.js';
import { OpaWatcherAdapter } from '../../../src/yaml/adapters/remaining/opa-watcher.js';
import { AuditPolicyAdapter } from '../../../src/yaml/adapters/remaining/audit-policy.js';
import { AuditSinkAdapter } from '../../../src/yaml/adapters/remaining/audit-sink.js';
import { adapterRegistry } from '../../../src/yaml/adapters/adapter-registry.js';
import type { LoxilbApi } from '../../../src/api/index.js';
import type { YamlResource } from '../../../src/yaml/types.js';

/** Records raw API calls; GET answers with getData. */
function mockApi(getData: unknown = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return { ok: true, data: method === 'GET' ? getData : undefined };
  };
  const api = { raw: { get: record('GET'), post: record('POST'), del: record('DELETE') } };
  return { api: api as unknown as LoxilbApi, calls };
}

function makeResource(kind: string, spec: Record<string, unknown>): YamlResource {
  return { apiVersion: 'v1', kind, metadata: { name: 'test' }, spec };
}

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

  test('AiUserRateLimit identity and create', async () => {
    const adapter = new AiUserRateLimitAdapter();
    const spec = { tenant_id: 'tenant1', user_id: 'alice', rps: 5 };
    expect(adapter.extractIdentityKey(spec)).toBe('tenant1/alice');
    const { api, calls } = mockApi();
    await adapter.create(api, makeResource('AiUserRateLimit', spec));
    expect(calls).toEqual([{ method: 'POST', path: '/config/ai/user/ratelimit', body: spec }]);
  });

  test('AiRateLimitDefaults identity and create', async () => {
    const adapter = new AiRateLimitDefaultsAdapter();
    const spec = { scope: 'rule', rule_ident: 'svc-a', default_user_rps: 10 };
    expect(adapter.extractIdentityKey(spec)).toBe('rule/svc-a');
    const { api, calls } = mockApi();
    await adapter.create(api, makeResource('AiRateLimitDefaults', spec));
    expect(calls).toEqual([{ method: 'POST', path: '/config/ai/ratelimit/defaults', body: spec }]);
  });

  test('AiUserRateLimit and AiRateLimitDefaults have no live state to read', async () => {
    const { api, calls } = mockApi();
    for (const adapter of [new AiUserRateLimitAdapter(), new AiRateLimitDefaultsAdapter()]) {
      const result = await adapter.getAll(api);
      expect(result.ok && result.data).toEqual([]);
    }
    expect(calls).toEqual([]);
  });

  test('AiObjective reads objectiveAttr and strips updated_at', async () => {
    const adapter = new AiObjectiveAdapter();
    const { api, calls } = mockApi({
      objectiveAttr: [{ name: 'batch', priority: -1, updated_at: '2026-01-01T00:00:00Z' }],
      source: 'store',
      store_reachable: true,
    });
    const result = await adapter.getAll(api);
    expect(calls[0].path).toBe('/config/ai/objective');
    expect(result.ok && result.data).toEqual([
      { kind: 'AiObjective', identityKey: 'batch', spec: { name: 'batch', priority: -1 } },
    ]);
  });

  test('AiObjective reads priority 0 as unset', () => {
    const adapter = new AiObjectiveAdapter();
    expect(adapter.normalizeGetResponse({ name: 'batch', priority: 0, updated_at: '2026-01-01T00:00:00Z' })).toEqual({
      name: 'batch',
    });
    expect(adapter.normalizeGetResponse(adapter.toApiBody({ name: 'batch', priority: 0 }))).toEqual({ name: 'batch' });
  });

  test('AiObjective without objectiveAttr has no live items', async () => {
    const { api } = mockApi({ source: 'store', store_reachable: true });
    const result = await new AiObjectiveAdapter().getAll(api);
    expect(result.ok && result.data).toEqual([]);
  });

  test('AiObjective delete path', async () => {
    const { api, calls } = mockApi();
    await new AiObjectiveAdapter().delete(api, makeResource('AiObjective', { name: 'batch' }));
    expect(calls).toEqual([{ method: 'DELETE', path: '/config/ai/objective/batch' }]);
  });

  test('AiNetIdentity identity and create', async () => {
    const adapter = new AiNetIdentityAdapter();
    const spec = { name: 'lab', match: { cidr: ['10.0.0.0/8'] }, tenant: 'tenant1' };
    expect(adapter.extractIdentityKey(spec)).toBe('lab');
    const { api, calls } = mockApi();
    await adapter.create(api, makeResource('AiNetIdentity', spec));
    expect(calls).toEqual([{ method: 'POST', path: '/config/ai/netidentity', body: spec }]);
  });

  test('AiNetIdentity with a null list has no live items', async () => {
    const { api } = mockApi({ netIdentityAttr: null });
    const result = await new AiNetIdentityAdapter().getAll(api);
    expect(result.ok && result.data).toEqual([]);
  });

  test('AiJwtAuthProfile reads jwtAuthProfileAttr and deletes by name', async () => {
    const adapter = new AiJwtAuthProfileAdapter();
    const profile = { name: 'keycloak', issuer: 'https://idp.example.com/realms/ai' };
    const { api, calls } = mockApi({ jwtAuthProfileAttr: [profile] });
    const result = await adapter.getAll(api);
    expect(result.ok && result.data).toEqual([
      { kind: 'AiJwtAuthProfile', identityKey: 'keycloak', spec: profile },
    ]);
    await adapter.delete(api, makeResource('AiJwtAuthProfile', profile));
    expect(calls[1]).toEqual({ method: 'DELETE', path: '/config/ai/jwtauthprofile/keycloak' });
  });

  test('AiJwtAuthProfile drops the null lists GET reports when unset', async () => {
    const adapter = new AiJwtAuthProfileAdapter();
    const profile = { name: 'keycloak', issuer: 'https://idp.example.com/realms/ai' };
    const { api } = mockApi({ jwtAuthProfileAttr: [{ ...profile, algs: null, audiences: null }] });
    const result = await adapter.getAll(api);
    expect(result.ok && result.data[0].spec).toEqual(profile);
    const withAlgs = { ...profile, algs: ['RS256'] };
    expect(adapter.normalizeGetResponse({ ...withAlgs, audiences: null })).toEqual(withAlgs);
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

  test('Policy strips the read-only attached state', () => {
    const adapter = new PolicyAdapter();
    const config = {
      policyIdent: 'pol1',
      policyInfo: { committedInfoRate: 100 },
      targetObject: { attachment: 0, polObjName: '10.0.0.1:80:tcp' },
    };
    expect(adapter.normalizeGetResponse({ ...config, attached: false })).toEqual(config);
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

  test('AuditPolicy is singleton and has no DELETE', async () => {
    const adapter = new AuditPolicyAdapter();
    expect(adapter.extractIdentityKey({ max_segment_bytes: 1048576 })).toBe('AuditPolicy');
    const result = await adapter.delete({} as LoxilbApi, makeResource('AuditPolicy', {}));
    expect(!result.ok && result.error.status).toBe(405);
  });

  test('AuditSink is singleton and strips session state', () => {
    const adapter = new AuditSinkAdapter();
    expect(adapter.extractIdentityKey({})).toBe('AuditSink');
    const config = { enabled: true, address: 'siem.example.com:6514', ca_bundle_path: '/etc/ca.pem' };
    const result = adapter.normalizeGetResponse({
      ...config,
      connected: true,
      submitted: 120,
      truncated: 0,
      write_errors: 1,
      last_error: 'i/o timeout',
    });
    expect(result).toEqual(config);
  });

  test('AuditSink enabled: false matches the {} GET reports with no sink', () => {
    const adapter = new AuditSinkAdapter();
    const desired = adapter.normalizeGetResponse(adapter.toApiBody({ enabled: false }));
    expect(desired).toEqual(adapter.normalizeGetResponse({}));
  });
});

describe('Remaining adapter registration', () => {
  test('all 20 remaining adapters are registered', () => {
    const kinds = [
      'IpsecTunnel', 'IpsecCertificate', 'IpsecCaCertificate', 'IpsecConfig',
      'AiApiKey', 'AiTenantRateLimit', 'AiUserRateLimit', 'AiRateLimitDefaults',
      'AiObjective', 'AiNetIdentity', 'AiJwtAuthProfile',
      'Bfd', 'Policy', 'Mirror',
      'Params', 'Cors', 'SniCertificate', 'OpaWatcher', 'AuditPolicy', 'AuditSink',
    ];
    for (const kind of kinds) {
      expect(adapterRegistry.get(kind)).toBeDefined();
    }
  });
});
