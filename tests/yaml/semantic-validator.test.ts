import { describe, test, expect } from 'bun:test';
import { validateSemantic } from '../../src/yaml/validator/semantic-validator.js';
import type { YamlResource } from '../../src/yaml/types.js';

function makeResource(
  kind: string,
  name: string,
  spec: Record<string, unknown>,
): YamlResource {
  return {
    apiVersion: 'loxilb.io/v1',
    kind,
    metadata: { name },
    spec,
  };
}

describe('validateSemantic - unknown kind', () => {
  test('returns empty errors for unknown kind', () => {
    const resource = makeResource('SomeUnknownKind', 'test', { foo: 'bar' });
    const errors = validateSemantic(resource);
    expect(errors).toEqual([]);
  });
});

describe('validateSemantic - LoadBalancer', () => {
  test('returns no errors for valid LoadBalancer', () => {
    const resource = makeResource('LoadBalancer', 'valid-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
        monitor: true,
        probetype: 'ping',
        mode: 4,
        sel: 0,
      },
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches probeType without monitor', () => {
    const resource = makeResource('LoadBalancer', 'probe-lb', {
      serviceArguments: {
        probetype: 'ping',
        monitor: false,
      },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].fieldPath).toBe('serviceArguments.probetype');
    expect(errors[0].layer).toBe('semantic');
  });

  test('catches pd_cache_aware_mode without pd_disagg_mode', () => {
    const resource = makeResource('LoadBalancer', 'pd-lb', {
      serviceArguments: {
        pd_cache_aware_mode: true,
        pd_disagg_mode: false,
      },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('serviceArguments.pd_cache_aware_mode');
  });

  test('catches session_header_name without persist', () => {
    const resource = makeResource('LoadBalancer', 'session-lb', {
      serviceArguments: {
        session_header_name: 'X-Session',
        sel: 0,
      },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('serviceArguments.session_header_name');
  });

  test('allows session_header_name with sel=persist (integer)', () => {
    const resource = makeResource('LoadBalancer', 'session-ok-lb', {
      serviceArguments: {
        session_header_name: 'X-Session',
        sel: 3,
      },
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('allows session_header_name with sel=persist (string)', () => {
    const resource = makeResource('LoadBalancer', 'session-ok-str-lb', {
      serviceArguments: {
        session_header_name: 'X-Session',
        sel: 'persist',
      },
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches mtls_frontend without https security', () => {
    const resource = makeResource('LoadBalancer', 'mtls-lb', {
      serviceArguments: {
        mtls_frontend: true,
        security: 0,
        mode: 4,
      },
    });
    const errors = validateSemantic(resource);
    const secError = errors.find((e) => e.message.includes('security'));
    expect(secError).toBeDefined();
  });

  test('catches mtls_frontend without fullproxy mode', () => {
    const resource = makeResource('LoadBalancer', 'mtls-mode-lb', {
      serviceArguments: {
        mtls_frontend: true,
        security: 1,
        mode: 0,
      },
    });
    const errors = validateSemantic(resource);
    const modeError = errors.find((e) => e.message.includes('mode'));
    expect(modeError).toBeDefined();
  });

  test('returns no errors when serviceArguments is absent', () => {
    const resource = makeResource('LoadBalancer', 'no-sa-lb', {});
    expect(validateSemantic(resource)).toEqual([]);
  });
});

describe('validateSemantic - Firewall', () => {
  test('returns no errors for valid Firewall', () => {
    const resource = makeResource('Firewall', 'valid-fw', {
      ruleArguments: {
        sourceIP: '10.0.0.0/8',
        destinationIP: '0.0.0.0/0',
        preference: 100,
      },
      opts: { allow: true },
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches mutually exclusive actions', () => {
    const resource = makeResource('Firewall', 'multi-action-fw', {
      ruleArguments: {},
      opts: { drop: true, redirect: true },
    });
    const errors = validateSemantic(resource);
    const actionError = errors.find((e) => e.message.includes('Mutually exclusive'));
    expect(actionError).toBeDefined();
    expect(actionError!.fieldPath).toBe('opts');
  });

  test('catches redirect without redirectPortName', () => {
    const resource = makeResource('Firewall', 'redirect-fw', {
      ruleArguments: {},
      opts: { redirect: true },
    });
    const errors = validateSemantic(resource);
    const redirectError = errors.find((e) => e.fieldPath === 'opts.redirectPortName');
    expect(redirectError).toBeDefined();
  });

  test('catches invalid port range (source)', () => {
    const resource = makeResource('Firewall', 'port-fw', {
      ruleArguments: {
        minSourcePort: 1000,
        maxSourcePort: 500,
      },
      opts: { allow: true },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].fieldPath).toBe('ruleArguments.minSourcePort');
  });

  test('catches invalid port range (destination)', () => {
    const resource = makeResource('Firewall', 'port-dst-fw', {
      ruleArguments: {
        minDestinationPort: 8080,
        maxDestinationPort: 80,
      },
      opts: { allow: true },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].fieldPath).toBe('ruleArguments.minDestinationPort');
  });

  test('catches invalid CIDR in sourceIP', () => {
    const resource = makeResource('Firewall', 'cidr-fw', {
      ruleArguments: {
        sourceIP: '999.0.0.0/24',
      },
      opts: { allow: true },
    });
    const errors = validateSemantic(resource);
    const cidrError = errors.find((e) => e.fieldPath === 'ruleArguments.sourceIP');
    expect(cidrError).toBeDefined();
  });

  test('catches invalid CIDR in destinationIP', () => {
    const resource = makeResource('Firewall', 'cidr-dst-fw', {
      ruleArguments: {
        destinationIP: '10.0.0.0/33',
      },
      opts: { allow: true },
    });
    const errors = validateSemantic(resource);
    const cidrError = errors.find((e) => e.fieldPath === 'ruleArguments.destinationIP');
    expect(cidrError).toBeDefined();
  });
});

describe('validateSemantic - IpsecTunnel', () => {
  test('returns no errors for valid IpsecTunnel', () => {
    const resource = makeResource('IpsecTunnel', 'valid-ipsec', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'psk',
      psk: 'mysecret',
      ikeVersion: 'ikev2',
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches psk auth without psk field', () => {
    const resource = makeResource('IpsecTunnel', 'no-psk', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'psk',
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('psk');
    expect(errors[0].message).toContain('PSK');
  });

  test('catches cert auth without certName and caCertName', () => {
    const resource = makeResource('IpsecTunnel', 'no-cert', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'cert',
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(2);
    const certError = errors.find((e) => e.fieldPath === 'certName');
    const caError = errors.find((e) => e.fieldPath === 'caCertName');
    expect(certError).toBeDefined();
    expect(caError).toBeDefined();
  });

  test('catches invalid CIDR in selector', () => {
    const resource = makeResource('IpsecTunnel', 'bad-cidr', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'psk',
      psk: 'secret',
      selector: { srcCidr: '999.0.0.0/24', dstCidr: '10.0.0.0/33' },
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(2);
  });

  test('catches mobike with ikev1', () => {
    const resource = makeResource('IpsecTunnel', 'mobike-v1', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'psk',
      psk: 'secret',
      mobike: true,
      ikeVersion: 'ikev1',
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('mobike');
    expect(errors[0].message).toContain('IKEv2');
  });

  test('allows mobike with ikev2', () => {
    const resource = makeResource('IpsecTunnel', 'mobike-v2', {
      name: 'tun1',
      localIp: '1.1.1.1',
      remoteIp: '2.2.2.2',
      authMode: 'psk',
      psk: 'secret',
      mobike: true,
      ikeVersion: 'ikev2',
    });
    expect(validateSemantic(resource)).toEqual([]);
  });
});

describe('validateSemantic - BgpGlobal', () => {
  test('returns no errors for valid BgpGlobal', () => {
    const resource = makeResource('BgpGlobal', 'valid-bgp', {
      routerId: '1.1.1.1',
      localAs: 65000,
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches invalid routerId', () => {
    const resource = makeResource('BgpGlobal', 'bad-router', {
      routerId: '999.0.0.0',
      localAs: 65000,
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('routerId');
  });

  test('catches out-of-range AS number', () => {
    const resource = makeResource('BgpGlobal', 'bad-as', {
      routerId: '1.1.1.1',
      localAs: 0,
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('localAs');
  });

  test('catches AS number exceeding max', () => {
    const resource = makeResource('BgpGlobal', 'huge-as', {
      routerId: '1.1.1.1',
      localAs: 4294967296,
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('localAs');
  });
});

describe('validateSemantic - BgpNeighbor', () => {
  test('returns no errors for valid BgpNeighbor', () => {
    const resource = makeResource('BgpNeighbor', 'valid-neighbor', {
      ipAddress: '10.0.0.1',
      remoteAs: 65001,
    });
    expect(validateSemantic(resource)).toEqual([]);
  });

  test('catches invalid neighbor IP', () => {
    const resource = makeResource('BgpNeighbor', 'bad-ip', {
      ipAddress: '999.0.0.1',
      remoteAs: 65001,
    });
    const errors = validateSemantic(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldPath).toBe('ipAddress');
  });
});

describe('validateSemantic - error shape', () => {
  test('all errors have correct shape with layer=semantic', () => {
    const resource = makeResource('LoadBalancer', 'shape-test', {
      serviceArguments: {
        probetype: 'ping',
        monitor: false,
      },
    });
    const errors = validateSemantic(resource);
    for (const err of errors) {
      expect(err).toHaveProperty('resourceName', 'shape-test');
      expect(err).toHaveProperty('kind', 'LoadBalancer');
      expect(err).toHaveProperty('fieldPath');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('suggestion');
      expect(err).toHaveProperty('layer', 'semantic');
    }
  });
});
