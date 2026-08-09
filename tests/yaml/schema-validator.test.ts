import { describe, test, expect } from 'bun:test';
import { schemaRegistry } from '../../src/yaml/schema/registry.js';
import {
  validateSchema,
  normalizeEnums,
} from '../../src/yaml/validator/schema-validator.js';
import { isValidCidr, isValidIpv4 } from '../../src/yaml/validator/formats.js';
import type { YamlResource } from '../../src/yaml/types.js';

// Helper to create a YamlResource for testing
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

describe('SchemaRegistry.validateRaw', () => {
  test('returns valid for correct LoadBalancer data', () => {
    const result = schemaRegistry.validateRaw('LoadBalancer', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('returns errors for invalid LoadBalancer data', () => {
    const result = schemaRegistry.validateRaw('LoadBalancer', {
      serviceArguments: { port: 'abc' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Errors should be raw ajv ErrorObject[]
    expect(result.errors[0]).toHaveProperty('keyword');
    expect(result.errors[0]).toHaveProperty('instancePath');
  });

  test('returns { valid: false, errors: [] } for unknown kind', () => {
    const result = schemaRegistry.validateRaw('UnknownKind', {});
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([]);
  });
});

describe('normalizeEnums', () => {
  test('converts string enum values to integers for LoadBalancer', () => {
    const spec = {
      serviceArguments: { mode: 'fullproxy', sel: 'persist' },
    };
    const result = normalizeEnums('LoadBalancer', spec);
    expect((result.serviceArguments as Record<string, unknown>).mode).toBe(4);
    expect((result.serviceArguments as Record<string, unknown>).sel).toBe(3);
  });

  test('leaves integer enum values unchanged', () => {
    const spec = {
      serviceArguments: { mode: 4, sel: 3 },
    };
    const result = normalizeEnums('LoadBalancer', spec);
    expect((result.serviceArguments as Record<string, unknown>).mode).toBe(4);
    expect((result.serviceArguments as Record<string, unknown>).sel).toBe(3);
  });

  test('returns spec unchanged for kinds with no enum maps', () => {
    const spec = { routerId: '1.1.1.1', localAs: 65000 };
    const result = normalizeEnums('BgpGlobal', spec);
    expect(result).toEqual(spec);
  });

  test('does not mutate the original spec', () => {
    const spec = {
      serviceArguments: { mode: 'fullproxy' },
    };
    const original = structuredClone(spec);
    normalizeEnums('LoadBalancer', spec);
    expect(spec).toEqual(original);
  });

  test('handles missing nested paths gracefully', () => {
    const spec = { someField: 'value' };
    const result = normalizeEnums('LoadBalancer', spec);
    expect(result).toEqual(spec);
  });
});

describe('validateSchema', () => {
  test('returns empty errors for valid LoadBalancer resource', () => {
    const resource = makeResource('LoadBalancer', 'valid-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    const errors = validateSchema(resource);
    expect(errors).toEqual([]);
  });

  test('returns error for wrong type (port as string)', () => {
    const resource = makeResource('LoadBalancer', 'bad-type-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 'abc',
        protocol: 'tcp',
      },
    });
    const errors = validateSchema(resource);
    expect(errors.length).toBeGreaterThan(0);
    const typeError = errors.find((e) => e.fieldPath.includes('port'));
    expect(typeError).toBeDefined();
    expect(typeError!.suggestion).toContain('type');
    expect(typeError!.layer).toBe('schema');
  });

  test('passes when string enum values are normalized', () => {
    const resource = makeResource('LoadBalancer', 'string-enum-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
        mode: 'fullproxy',
        sel: 'rr',
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    const errors = validateSchema(resource);
    expect(errors).toEqual([]);
  });

  test('returns error for unknown resource kind', () => {
    const resource = makeResource('UnknownKind', 'test', { foo: 'bar' });
    const errors = validateSchema(resource);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Unknown resource kind');
    expect(errors[0].suggestion).toContain('valid kinds');
    expect(errors[0].layer).toBe('schema');
  });

  test('uses dot notation for field paths, not JSON Pointer', () => {
    const resource = makeResource('LoadBalancer', 'dot-test-lb', {
      serviceArguments: {
        port: 'not-a-number',
        protocol: 'tcp',
      },
    });
    const errors = validateSchema(resource);
    const portError = errors.find((e) => e.fieldPath.includes('port'));
    expect(portError).toBeDefined();
    // Should use dots, not slashes
    expect(portError!.fieldPath).not.toContain('/');
    expect(portError!.fieldPath).toContain('.');
  });

  test('includes resourceName and kind in errors', () => {
    const resource = makeResource('LoadBalancer', 'my-lb', {
      serviceArguments: { port: 'bad' },
    });
    const errors = validateSchema(resource);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].resourceName).toBe('my-lb');
    expect(errors[0].kind).toBe('LoadBalancer');
  });

  test('generates suggestion for invalid enum value', () => {
    const resource = makeResource('LoadBalancer', 'enum-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'invalid-protocol',
      },
    });
    const errors = validateSchema(resource);
    const enumError = errors.find((e) => e.fieldPath.includes('protocol'));
    expect(enumError).toBeDefined();
    expect(enumError!.suggestion).toContain('Use one of');
  });
});

describe('isValidCidr', () => {
  test('returns true for valid CIDR', () => {
    expect(isValidCidr('10.0.0.0/24')).toBe(true);
    expect(isValidCidr('192.168.1.0/32')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
  });

  test('returns false for invalid prefix length', () => {
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
    expect(isValidCidr('10.0.0.0/-1')).toBe(false);
  });

  test('returns false for invalid IP in CIDR', () => {
    expect(isValidCidr('999.0.0.0/24')).toBe(false);
    expect(isValidCidr('10.0.0.256/24')).toBe(false);
  });

  test('returns false for missing prefix', () => {
    expect(isValidCidr('10.0.0.0')).toBe(false);
  });
});

describe('isValidIpv4', () => {
  test('returns true for valid IPv4', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
  });

  test('returns false for invalid IPv4', () => {
    expect(isValidIpv4('999.0.0.0')).toBe(false);
    expect(isValidIpv4('10.0.0')).toBe(false);
    expect(isValidIpv4('10.0.0.0.0')).toBe(false);
    expect(isValidIpv4('abc.def.ghi.jkl')).toBe(false);
  });
});
