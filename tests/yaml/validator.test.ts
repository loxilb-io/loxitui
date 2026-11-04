import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';
import { validateResource, validateFile } from '../../src/yaml/validator/index.js';
import type { YamlResource } from '../../src/yaml/types.js';

const FIXTURES_DIR = resolve(import.meta.dir, 'fixtures');

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

describe('validateResource', () => {
  test('returns valid for correct LoadBalancer', () => {
    const resource = makeResource('LoadBalancer', 'ok-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
        monitor: true,
        probetype: 'ping',
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    const result = validateResource(resource);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.resourceName).toBe('ok-lb');
    expect(result.kind).toBe('LoadBalancer');
  });

  test('returns schema errors and skips semantic for invalid schema', () => {
    const resource = makeResource('LoadBalancer', 'bad-schema-lb', {
      serviceArguments: {
        port: 'abc', // wrong type
        protocol: 'tcp',
        probetype: 'ping',
        monitor: false, // would trigger semantic error
      },
    });
    const result = validateResource(resource);
    expect(result.valid).toBe(false);
    // Should have schema errors
    const schemaErrors = result.errors.filter((e) => e.layer === 'schema');
    expect(schemaErrors.length).toBeGreaterThan(0);
    // Should NOT have semantic errors (L2 skipped because L1 failed)
    const semanticErrors = result.errors.filter((e) => e.layer === 'semantic');
    expect(semanticErrors.length).toBe(0);
  });

  test('returns semantic errors when schema passes', () => {
    const resource = makeResource('LoadBalancer', 'semantic-fail-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
        probetype: 'ping',
        monitor: false, // semantic violation
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    const result = validateResource(resource);
    expect(result.valid).toBe(false);
    const semanticErrors = result.errors.filter((e) => e.layer === 'semantic');
    expect(semanticErrors.length).toBeGreaterThan(0);
  });

  test('schemaOnly option skips semantic validation', () => {
    const resource = makeResource('LoadBalancer', 'schema-only-lb', {
      serviceArguments: {
        externalIP: '10.10.10.1',
        port: 80,
        protocol: 'tcp',
        probetype: 'ping',
        monitor: false, // would fail semantic but not schema
      },
      endpoints: [
        { endpointIP: '192.168.1.10', targetPort: 8080, weight: 1 },
      ],
    });
    const result = validateResource(resource, { schemaOnly: true });
    // Schema passes, so result should be valid (semantic skipped)
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('validateFile', () => {
  test('validates a valid fixture file', () => {
    const result = validateFile(resolve(FIXTURES_DIR, 'invalid-semantic.yaml'));
    expect(result.filePath).toContain('invalid-semantic.yaml');
    // File has 2 resources (LoadBalancer + Firewall), both with semantic issues
    expect(result.resources.length).toBe(2);
  });

  test('returns parseError for nonexistent file', () => {
    const result = validateFile(resolve(FIXTURES_DIR, 'nonexistent.yaml'));
    expect(result.parseError).toBeDefined();
    expect(result.resources).toEqual([]);
  });

  test('validates schema-invalid file and catches errors', () => {
    const result = validateFile(resolve(FIXTURES_DIR, 'invalid-schema.yaml'));
    expect(result.resources.length).toBe(1);
    const resource = result.resources[0];
    expect(resource.valid).toBe(false);
    expect(resource.errors.length).toBeGreaterThan(0);
  });

  test('validates multi-doc file independently per resource', () => {
    const result = validateFile(resolve(FIXTURES_DIR, 'invalid-semantic.yaml'));
    // Each resource should be validated independently
    for (const resource of result.resources) {
      // Errors should reference the specific resource
      for (const err of resource.errors) {
        expect(err.resourceName).toBe(resource.resourceName);
        expect(err.kind).toBe(resource.kind);
      }
    }
  });

  test('schemaOnly on file skips semantic errors', () => {
    const result = validateFile(
      resolve(FIXTURES_DIR, 'invalid-semantic.yaml'),
      { schemaOnly: true },
    );
    // All resources should pass (they are schema-valid but semantic-invalid)
    for (const resource of result.resources) {
      expect(resource.valid).toBe(true);
    }
  });

  test('L2 errors only appear when L1 passes per-resource', () => {
    // invalid-schema.yaml has schema errors -> no semantic errors
    const result = validateFile(resolve(FIXTURES_DIR, 'invalid-schema.yaml'));
    for (const resource of result.resources) {
      if (!resource.valid) {
        const semanticErrors = resource.errors.filter((e) => e.layer === 'semantic');
        const schemaErrors = resource.errors.filter((e) => e.layer === 'schema');
        if (schemaErrors.length > 0) {
          expect(semanticErrors.length).toBe(0);
        }
      }
    }
  });
});
