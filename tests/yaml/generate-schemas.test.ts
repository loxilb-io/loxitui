import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const GENERATED_DIR = join(import.meta.dir, '../../src/yaml/schema/generated');

describe('Schema Generator Output', () => {
  test('produces JSON files for all configurable resource kinds', () => {
    const jsonFiles = readdirSync(GENERATED_DIR).filter((f) => f.endsWith('.json'));
    // 34 configurable kinds (PII/LlamaFirewall removed as unstable, SynFlood removed from gateway)
    expect(jsonFiles.length).toBeGreaterThanOrEqual(34);
  });

  test('generates index.ts barrel file', () => {
    expect(existsSync(join(GENERATED_DIR, 'index.ts'))).toBe(true);
  });

  test('index.ts exports all schema kinds', () => {
    const indexContent = readFileSync(join(GENERATED_DIR, 'index.ts'), 'utf8');
    const jsonFiles = readdirSync(GENERATED_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));

    for (const kind of jsonFiles) {
      expect(indexContent).toContain(`'${kind}'`);
    }
  });

  test('LoadBalancer.json has $schema field and serviceArguments wrapper', () => {
    const schema = JSON.parse(
      readFileSync(join(GENERATED_DIR, 'LoadBalancer.json'), 'utf8')
    );
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.properties.serviceArguments).toBeDefined();
    expect(schema.properties.serviceArguments.type).toBe('object');
    expect(schema.properties.serviceArguments.properties.externalIP).toBeDefined();
    expect(schema.properties.endpoints).toBeDefined();
  });

  test('Firewall.json has resolved $ref (no $ref strings remain)', () => {
    const raw = readFileSync(join(GENERATED_DIR, 'Firewall.json'), 'utf8');
    expect(raw).not.toContain('"$ref"');

    const schema = JSON.parse(raw);
    expect(schema.properties.ruleArguments).toBeDefined();
    expect(schema.properties.ruleArguments.properties.sourceIP).toBeDefined();
    expect(schema.properties.opts).toBeDefined();
    expect(schema.properties.opts.properties.allow).toBeDefined();
  });

  test('AiApiKey.json has nullable types for x-nullable fields', () => {
    const schema = JSON.parse(readFileSync(join(GENERATED_DIR, 'AiApiKey.json'), 'utf8'));
    // enabled should be nullable: ["boolean", "null"]
    const enabledType = schema.properties.enabled?.type;
    expect(Array.isArray(enabledType)).toBe(true);
    expect(enabledType).toContain('null');
  });

  test('description fields from swagger are preserved', () => {
    const schema = JSON.parse(
      readFileSync(join(GENERATED_DIR, 'LoadBalancer.json'), 'utf8')
    );
    const externalIPDesc =
      schema.properties.serviceArguments.properties.externalIP.description;
    expect(typeof externalIPDesc).toBe('string');
    expect(externalIPDesc.length).toBeGreaterThan(0);
  });

  test('integer enum values are preserved as-is in generated schemas', () => {
    const schema = JSON.parse(
      readFileSync(join(GENERATED_DIR, 'LoadBalancer.json'), 'utf8')
    );
    const modeEnum =
      schema.properties.serviceArguments.properties.mode.enum;
    expect(modeEnum).toBeDefined();
    // Should contain integers 0-6
    expect(modeEnum).toContain(0);
    expect(modeEnum).toContain(6);
  });

  test('all generated schemas have $schema field', () => {
    const jsonFiles = readdirSync(GENERATED_DIR).filter((f) => f.endsWith('.json'));
    for (const file of jsonFiles) {
      const schema = JSON.parse(readFileSync(join(GENERATED_DIR, file), 'utf8'));
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  test('all generated schemas have additionalProperties: false at top level', () => {
    const jsonFiles = readdirSync(GENERATED_DIR).filter((f) => f.endsWith('.json'));
    for (const file of jsonFiles) {
      const schema = JSON.parse(readFileSync(join(GENERATED_DIR, file), 'utf8'));
      expect(schema.additionalProperties).toBe(false);
    }
  });
});
