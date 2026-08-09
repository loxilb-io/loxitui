#!/usr/bin/env bun
/**
 * Build-time schema generator: swagger_new.yml -> JSON Schema files.
 *
 * Reads the Swagger 2.0 spec, extracts POST body definitions for all 38
 * configurable resource kinds, resolves $ref chains, converts to JSON Schema
 * draft-2020-12, and writes individual .json files + a barrel index.ts.
 *
 * Usage: bun scripts/generate-schemas.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join, dirname } from 'path';

// ── Types ──────────────────────────────────────────────────────────

interface SwaggerSpec {
  paths: Record<string, Record<string, SwaggerOperation>>;
  definitions: Record<string, SwaggerDefinition>;
}

interface SwaggerOperation {
  parameters?: SwaggerParameter[];
  [key: string]: unknown;
}

interface SwaggerParameter {
  in: string;
  name: string;
  schema?: { $ref?: string };
  [key: string]: unknown;
}

interface SwaggerDefinition {
  type?: string;
  required?: string[];
  properties?: Record<string, SwaggerProperty>;
  items?: SwaggerProperty;
  $ref?: string;
  description?: string;
  [key: string]: unknown;
}

interface SwaggerProperty {
  type?: string;
  format?: string;
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  $ref?: string;
  properties?: Record<string, SwaggerProperty>;
  items?: SwaggerProperty;
  required?: string[];
  'x-nullable'?: boolean;
  minimum?: number;
  maximum?: number;
  [key: string]: unknown;
}

// ── Configuration ──────────────────────────────────────────────────

/** POST endpoints to EXCLUDE from schema generation (non-configurable) */
const EXCLUDED_ENDPOINTS = new Set([
  '/auth/login',
  '/auth/logout',
  '/auth/token/upgrade',
  '/auth/users',
  '/config/trace/enable',
  '/config/trace/disable',
  '/config/trace/otlp',
  '/config/l4trace/enable',
  '/config/l4trace/disable',
  '/config/l4trace/stats/reset',
  '/config/cistate',
  '/config/gpu/enable',
  '/config/gpu/disable',
  '/config/gpu/conversations/cleanup',
  '/config/worker/metrics',
  '/config/pii/enable',
  '/config/llamafirewall/enable',
  '/config/llamafirewall/health',
  '/config/ipsec/certificates/validate',
  '/config/securityrate/reset',
  // Unstable — excluded from the public TUI by product decision; do not
  // re-add without an explicit sign-off (the gateway marks these unreleased):
  '/config/sessionulcl',
  '/config/l7policy',
]);

/**
 * Extra properties per kind that the swagger body definition does not carry
 * but the REST paths require (parent ids / path params). The adapters
 * substitute these into {placeholders} and the gateway ignores them in bodies.
 */
const SCHEMA_AUGMENTATIONS: Record<
  string,
  { properties: Record<string, unknown>; required?: string[] }
> = {
  VlanMember: {
    properties: {
      vid: { type: 'integer', description: 'Parent VLAN ID (path parameter)' },
    },
    required: ['vid'],
  },
  VxlanPeer: {
    properties: {
      vxlanID: { type: 'integer', description: 'Parent VxLAN tunnel ID (path parameter)' },
    },
    required: ['vxlanID'],
  },
  BgpPolicyDefinedSet: {
    properties: {
      type: {
        type: 'string',
        enum: ['prefix', 'neighbor', 'tag', 'community', 'ext-community', 'as-path', 'large-community'],
        description: 'Defined-set type (path parameter)',
      },
    },
    required: ['type'],
  },
};

// ── Ref Resolution ─────────────────────────────────────────────────

function resolveRef(
  ref: string,
  definitions: Record<string, SwaggerDefinition>
): SwaggerDefinition {
  const name = ref.replace('#/definitions/', '');
  const def = definitions[name];
  if (!def) throw new Error(`Unknown $ref: ${ref}`);
  return def;
}

// ── Property Conversion ────────────────────────────────────────────

function convertProperty(
  prop: SwaggerProperty,
  definitions: Record<string, SwaggerDefinition>,
  depth = 0
): Record<string, unknown> {
  // Guard against excessive recursion (max 3 levels)
  if (depth > 3) return { type: 'object' };

  // Handle $ref
  if (prop.$ref) {
    const resolved = resolveRef(prop.$ref, definitions);
    return convertDefinition(resolved, definitions, depth + 1);
  }

  const result: Record<string, unknown> = {};

  // Type handling with x-nullable
  if (prop.type) {
    if (prop['x-nullable']) {
      result.type = [prop.type, 'null'];
    } else {
      result.type = prop.type;
    }
  }

  // Preserve description (SCHM-04)
  if (prop.description) result.description = prop.description;

  // Preserve enum values as-is (integers stay integers)
  if (prop.enum) result.enum = prop.enum;

  // Preserve default
  if (prop.default !== undefined) result.default = prop.default;

  // Preserve constraints
  if (prop.minimum !== undefined) result.minimum = prop.minimum;
  if (prop.maximum !== undefined) result.maximum = prop.maximum;

  // Handle unsigned integer formats -> minimum: 0
  if (prop.format && /^uint/.test(prop.format) && result.minimum === undefined) {
    result.minimum = 0;
  }

  // Drop format (ajv ignores most integer/number formats)
  // Do NOT copy prop.format to result

  // Nested object properties
  if (prop.properties) {
    result.type = 'object';
    result.properties = {};
    for (const [key, val] of Object.entries(prop.properties)) {
      (result.properties as Record<string, unknown>)[key] = convertProperty(
        val,
        definitions,
        depth + 1
      );
    }
    if (prop.required) result.required = prop.required;
  }

  // Array items
  if (prop.items) {
    const convertedItems = convertProperty(prop.items, definitions, depth + 1);
    result.items = convertedItems;
    // If items had properties but no explicit type, ensure items is object type
    if (prop.items.properties && !(convertedItems as Record<string, unknown>).type) {
      (convertedItems as Record<string, unknown>).type = 'object';
    }
  }

  return result;
}

// ── Definition Conversion ──────────────────────────────────────────

function convertDefinition(
  def: SwaggerDefinition,
  definitions: Record<string, SwaggerDefinition>,
  depth = 0
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: 'object',
  };

  if (def.properties) {
    schema.properties = {};
    for (const [key, prop] of Object.entries(def.properties)) {
      (schema.properties as Record<string, unknown>)[key] = convertProperty(
        prop,
        definitions,
        depth
      );
    }
  }

  if (def.required) {
    schema.required = def.required;
  }

  if (def.description && depth > 0) {
    schema.description = def.description;
  }

  return schema;
}

// ── Main Generator ─────────────────────────────────────────────────

export function generateSchemas(swaggerPath: string, outputDir: string) {
  const swaggerText = readFileSync(swaggerPath, 'utf8');
  const swagger: SwaggerSpec = parse(swaggerText);
  const definitions = swagger.definitions;

  // Import the definition-to-kind mapping
  // We inline it here to avoid runtime module resolution issues in the script
  const defToKind: Record<string, string> = {};
  const { RESOURCE_METADATA } = require('../src/yaml/schema/identity-fields.ts');
  for (const meta of Object.values(RESOURCE_METADATA) as Array<{ definitionName: string; kind: string }>) {
    defToKind[meta.definitionName] = meta.kind;
  }

  // Ensure output dir exists
  mkdirSync(outputDir, { recursive: true });

  const generated: Array<{ kind: string; defName: string }> = [];

  // Iterate all paths and find POST operations with body $ref
  for (const [path, methods] of Object.entries(swagger.paths)) {
    const postOp = (methods as Record<string, SwaggerOperation>).post;
    if (!postOp) continue;

    // Skip non-configurable endpoints
    if (EXCLUDED_ENDPOINTS.has(path)) continue;

    // Find body parameter with $ref
    const bodyParam = postOp.parameters?.find(
      (p: SwaggerParameter) => p.in === 'body' && p.schema?.$ref
    );
    if (!bodyParam?.schema?.$ref) continue;

    const defName = bodyParam.schema.$ref.replace('#/definitions/', '');
    const definition = definitions[defName];
    if (!definition) {
      console.warn(`Warning: Definition not found: ${defName} (for ${path})`);
      continue;
    }

    // Map definition name to kind
    const kind = defToKind[defName];
    if (!kind) {
      // Not a configurable resource kind we track
      continue;
    }

    // Convert to JSON Schema
    const jsonSchema = convertDefinition(definition, definitions);

    // Merge path-parameter augmentations (fields the body definition lacks)
    const augment = SCHEMA_AUGMENTATIONS[kind];
    if (augment) {
      jsonSchema.properties = {
        ...(jsonSchema.properties as Record<string, unknown>),
        ...augment.properties,
      };
      if (augment.required) {
        jsonSchema.required = [
          ...((jsonSchema.required as string[]) ?? []),
          ...augment.required,
        ];
      }
    }

    // Add top-level JSON Schema metadata
    jsonSchema['$schema'] = 'https://json-schema.org/draft/2020-12/schema';
    jsonSchema['additionalProperties'] = false;

    // Write file
    const filePath = join(outputDir, `${kind}.json`);
    writeFileSync(filePath, JSON.stringify(jsonSchema, null, 2) + '\n');
    generated.push({ kind, defName });
  }

  // Sort for deterministic output
  generated.sort((a, b) => a.kind.localeCompare(b.kind));

  // Generate barrel index.ts
  const importLines = generated.map(
    (g) => `import ${g.kind}Schema from './${g.kind}.json';`
  );
  const mapEntries = generated.map((g) => `  '${g.kind}': ${g.kind}Schema,`);

  const indexContent = `/**
 * Auto-generated barrel file mapping kind -> JSON Schema.
 * DO NOT EDIT — regenerate with: bun scripts/generate-schemas.ts
 */
${importLines.join('\n')}

export const GENERATED_SCHEMAS: Record<string, object> = {
${mapEntries.join('\n')}
};
`;

  writeFileSync(join(outputDir, 'index.ts'), indexContent);

  console.log(`Generated ${generated.length} schemas in ${outputDir}`);
  for (const g of generated) {
    console.log(`  ${g.kind} <- ${g.defName}`);
  }

  return generated;
}

// ── CLI Entry Point ────────────────────────────────────────────────

if (import.meta.main) {
  const projectRoot = join(dirname(new URL(import.meta.url).pathname), '..');
  const swaggerPath = join(projectRoot, 'swagger_new.yml');
  const outputDir = join(projectRoot, 'src/yaml/schema/generated');

  if (!existsSync(swaggerPath)) {
    console.error(`Error: swagger_new.yml not found at ${swaggerPath}`);
    process.exit(1);
  }

  generateSchemas(swaggerPath, outputDir);
}
