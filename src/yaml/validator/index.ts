/**
 * Validation orchestrator: combines Layer 1 (schema) and Layer 2 (semantic)
 * validation with proper gating logic.
 *
 * L2 is skipped when L1 fails (schema errors prevent meaningful semantic analysis)
 * or when --schema-only is specified.
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYamlFile } from "../parser.js";
import type {
  FileValidationResult,
  ResourceValidationResult,
  ValidationError,
  YamlResource,
} from "../types.js";
import { validateSchema } from "./schema-validator.js";
import { validateSemantic } from "./semantic-validator.js";

/** Options controlling validation behavior */
export interface ValidateOptions {
  /** If true, skip semantic (L2) validation and run only schema (L1) */
  schemaOnly?: boolean;
}

/**
 * Validate a single resource through L1 (schema) then L2 (semantic).
 * L2 is skipped if L1 produces errors or schemaOnly is set.
 */
export function validateResource(
  resource: YamlResource,
  options?: ValidateOptions
): ResourceValidationResult {
  // Layer 1: Schema validation
  const schemaErrors = validateSchema(resource);

  // Layer 2: Semantic validation (skipped if L1 fails or schemaOnly)
  let semanticErrors: ValidationError[] = [];
  if (!options?.schemaOnly && schemaErrors.length === 0) {
    semanticErrors = validateSemantic(resource);
  }

  const allErrors = [...schemaErrors, ...semanticErrors];

  return {
    resourceName: resource.metadata.name,
    kind: resource.kind,
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Parse and validate all resources in a YAML file.
 * Returns parseError if the file cannot be parsed.
 */
export function validateFile(filePath: string, options?: ValidateOptions): FileValidationResult {
  let resources: YamlResource[];

  try {
    resources = parseYamlFile(filePath);
  } catch (err) {
    return {
      filePath,
      resources: [],
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  const results = resources.map((r) => validateResource(r, options));

  return {
    filePath,
    resources: results,
  };
}

/**
 * Recursively find and validate all .yaml/.yml files in a directory.
 */
export function validateDirectory(
  dirPath: string,
  options?: ValidateOptions
): FileValidationResult[] {
  const results: FileValidationResult[] = [];
  const resolvedDir = resolve(dirPath);

  function walkDir(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (/\.(yaml|yml)$/i.test(entry.name)) {
        results.push(validateFile(fullPath, options));
      }
    }
  }

  walkDir(resolvedDir);
  return results;
}
