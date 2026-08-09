/**
 * Runtime schema registry: merges generated JSON Schemas with static metadata
 * to provide lookup, validation, and query APIs for all downstream components.
 *
 * Singleton instance pre-compiles ajv validators at initialization for
 * consistent, fast validation throughout the application lifecycle.
 */

import Ajv from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { DomainGroup, EnumMapEntry, ResourceSchema } from "../types.js";
import { ENUM_MAPS } from "./enum-maps.js";
import { GENERATED_SCHEMAS } from "./generated/index.js";
import { RESOURCE_METADATA } from "./identity-fields.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SchemaRegistry {
  private schemas = new Map<string, ResourceSchema>();
  private validators = new Map<string, ValidateFunction>();

  constructor() {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    // Merge generated schemas with static metadata
    for (const [kind, meta] of Object.entries(RESOURCE_METADATA)) {
      const jsonSchema = GENERATED_SCHEMAS[kind];
      if (!jsonSchema) {
        console.warn(`SchemaRegistry: No generated schema for kind "${kind}"`);
        continue;
      }

      // Collect enum maps for this kind
      const enumMaps: Record<string, Record<string | number, string | number>> = {};
      for (const [fieldPath, entry] of Object.entries(ENUM_MAPS)) {
        if (fieldPath.startsWith(`${kind}.`)) {
          // Merge toApi and fromApi into a single bidirectional map
          enumMaps[fieldPath] = { ...entry.toApi, ...entry.fromApi };
        }
      }

      const resourceSchema: ResourceSchema = {
        ...meta,
        jsonSchema,
        enumMaps,
      };

      this.schemas.set(kind, resourceSchema);

      // Pre-compile ajv validator
      try {
        // Clone schema to avoid ajv mutating the original, and remove
        // $schema keyword which ajv doesn't expect in compiled schemas
        const schemaForCompile = { ...(jsonSchema as Record<string, unknown>) };
        delete schemaForCompile.$schema;
        this.validators.set(kind, ajv.compile(schemaForCompile));
      } catch (err) {
        console.warn(`SchemaRegistry: Failed to compile schema for "${kind}":`, err);
      }
    }
  }

  /** Look up the full ResourceSchema for a given kind */
  lookup(kind: string): ResourceSchema | undefined {
    return this.schemas.get(kind);
  }

  /** Return all registered kind strings */
  allKinds(): string[] {
    return Array.from(this.schemas.keys());
  }

  /** Return kind strings belonging to a specific domain group */
  kindsByDomain(domain: DomainGroup): string[] {
    return Array.from(this.schemas.values())
      .filter((s) => s.domainGroup === domain)
      .map((s) => s.kind);
  }

  /**
   * Validate data against the JSON Schema for a given kind.
   * Returns { valid: true } or { valid: false, errors: [...] } with
   * field-path error messages.
   */
  validate(kind: string, data: unknown): ValidationResult {
    const validator = this.validators.get(kind);
    if (!validator) {
      return { valid: false, errors: [`Unknown kind: ${kind}`] };
    }

    const valid = validator(data);
    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (validator.errors ?? []).map((e) => {
      const path = e.instancePath || "/";
      return `${path}: ${e.message}`;
    });

    return { valid: false, errors };
  }

  /**
   * Validate data and return raw ajv ErrorObject[] for detailed error mapping.
   * Unlike validate(), this preserves all ajv error detail for downstream processing.
   */
  validateRaw(kind: string, data: unknown): { valid: boolean; errors: ErrorObject[] } {
    const validator = this.validators.get(kind);
    if (!validator) {
      return { valid: false, errors: [] };
    }

    const valid = validator(data);
    return {
      valid: !!valid,
      errors: valid ? [] : [...(validator.errors ?? [])],
    };
  }

  /**
   * Look up the enum map for a specific dotted field path.
   * Example: getEnumMap('LoadBalancer.serviceArguments.mode')
   */
  getEnumMap(fieldPath: string): EnumMapEntry | undefined {
    return ENUM_MAPS[fieldPath];
  }

  /** Check if a kind represents an operational (non-configurable) resource */
  isOperational(kind: string): boolean {
    return this.schemas.get(kind)?.operational === true;
  }
}

/** Singleton registry instance */
export const schemaRegistry = new SchemaRegistry();
