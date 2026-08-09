/**
 * Layer 1 (Schema) validation: wraps SchemaRegistry.validateRaw() to produce
 * ValidationError[] with dot-notation field paths and keyword-specific fix suggestions.
 *
 * Also handles enum normalization — converting string enum values (e.g., mode: "fullproxy")
 * to their integer equivalents before schema validation.
 */

import type { ErrorObject } from "ajv";
import { ENUM_MAPS } from "../schema/enum-maps.js";
import { schemaRegistry } from "../schema/registry.js";
import type { ValidationError, YamlResource } from "../types.js";

/**
 * Normalize enum string values to integers in a spec before schema validation.
 * Uses ENUM_MAPS to find fields that accept string names and converts them.
 *
 * @param kind - The resource kind (e.g., "LoadBalancer")
 * @param spec - The resource spec to normalize
 * @returns A deep clone with string enum values replaced by integers
 */
export function normalizeEnums(
  kind: string,
  spec: Record<string, unknown>
): Record<string, unknown> {
  const cloned = structuredClone(spec);

  for (const [fieldPath, entry] of Object.entries(ENUM_MAPS)) {
    // Only process enum maps for this kind
    if (!fieldPath.startsWith(`${kind}.`)) continue;

    // Parse the dotted path after the kind prefix
    const pathParts = fieldPath.slice(kind.length + 1).split(".");

    // Navigate to the parent object and set the value
    let current: Record<string, unknown> = cloned;
    let found = true;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (
        current[part] !== undefined &&
        current[part] !== null &&
        typeof current[part] === "object"
      ) {
        current = current[part] as Record<string, unknown>;
      } else {
        found = false;
        break;
      }
    }

    if (!found) continue;

    const lastKey = pathParts[pathParts.length - 1];
    const value = current[lastKey];

    // Only convert string values that exist in the toApi map
    if (typeof value === "string" && value in entry.toApi) {
      current[lastKey] = entry.toApi[value];
    }
    // Leave integer values unchanged
  }

  return cloned;
}

/**
 * Generate a user-friendly fix suggestion based on the ajv error keyword.
 */
function generateSuggestion(error: ErrorObject): string {
  switch (error.keyword) {
    case "required": {
      const field = (error.params as { missingProperty?: string }).missingProperty ?? "unknown";
      return `Add required field "${field}" to the spec`;
    }
    case "type": {
      const type = (error.params as { type?: string }).type ?? "unknown";
      return `Change value to type ${type}`;
    }
    case "enum": {
      const allowed = (error.params as { allowedValues?: unknown[] }).allowedValues ?? [];
      return `Use one of: ${allowed.join(", ")}`;
    }
    case "additionalProperties": {
      const prop =
        (error.params as { additionalProperty?: string }).additionalProperty ?? "unknown";
      return `Remove unknown field "${prop}"`;
    }
    case "minimum": {
      const limit = (error.params as { limit?: number }).limit ?? 0;
      return `Value must be >= ${limit}`;
    }
    case "maximum": {
      const limit = (error.params as { limit?: number }).limit ?? 0;
      return `Value must be <= ${limit}`;
    }
    case "format": {
      const format = (error.params as { format?: string }).format ?? "unknown";
      return `Value must be a valid ${format}`;
    }
    default:
      return "Fix the value at this field path";
  }
}

/**
 * Convert ajv instancePath (JSON Pointer) to dot notation.
 * "/serviceArguments/port" -> "serviceArguments.port"
 */
function toDotNotation(instancePath: string): string {
  if (!instancePath) return "";
  // Strip leading slash, replace remaining slashes with dots
  return instancePath.slice(1).replace(/\//g, ".");
}

/**
 * Map a raw ajv ErrorObject to a ValidationError with dot-notation path and suggestion.
 */
function mapAjvError(error: ErrorObject, resource: YamlResource): ValidationError {
  let fieldPath = toDotNotation(error.instancePath);

  // For 'required' errors, append the missing property to the path
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string }).missingProperty;
    if (missing) {
      fieldPath = fieldPath ? `${fieldPath}.${missing}` : missing;
    }
  }

  return {
    resourceName: resource.metadata.name,
    kind: resource.kind,
    fieldPath,
    message: error.message ?? "Validation error",
    suggestion: generateSuggestion(error),
    layer: "schema",
  };
}

/**
 * Validate a YamlResource against its JSON Schema (Layer 1).
 *
 * Steps:
 * 1. Check kind is registered
 * 2. Normalize enum string values to integers
 * 3. Run schema validation via validateRaw()
 * 4. Map errors to ValidationError[] with suggestions
 *
 * @returns Array of ValidationErrors (empty if valid)
 */
export function validateSchema(resource: YamlResource): ValidationError[] {
  // Check if kind exists in registry
  const schema = schemaRegistry.lookup(resource.kind);
  if (!schema) {
    const validKinds = schemaRegistry.allKinds().join(", ");
    return [
      {
        resourceName: resource.metadata.name,
        kind: resource.kind,
        fieldPath: "",
        message: `Unknown resource kind "${resource.kind}"`,
        suggestion: `Use one of the valid kinds: ${validKinds}`,
        layer: "schema",
      },
    ];
  }

  // Normalize enum values (string -> integer)
  const normalizedSpec = normalizeEnums(resource.kind, resource.spec);

  // Run schema validation
  const result = schemaRegistry.validateRaw(resource.kind, normalizedSpec);

  if (result.valid) {
    return [];
  }

  // Map ajv errors to ValidationErrors
  return result.errors.map((error) => mapAjvError(error, resource));
}
