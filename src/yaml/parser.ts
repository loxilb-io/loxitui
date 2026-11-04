/**
 * YAML parser module with variable substitution, multi-document parsing,
 * and typed YamlResource construction.
 *
 * Pipeline: substituteVariables (raw text) -> detectUnresolvedVariables -> parseAllDocuments -> validate+construct
 *
 * LOCKED DECISION: Variable substitution happens on raw text BEFORE YAML parsing.
 * This ensures `port: ${PORT}` with PORT=443 becomes `port: 443` (integer),
 * not `port: "443"` (string).
 */

import { readFileSync } from "node:fs";
import { parse, parseAllDocuments } from "yaml";
import type { YamlResource } from "./types.js";

/** Custom error class for YAML parsing failures */
export class YamlParseError extends Error {
  override name = "YamlParseError" as const;
}

/** Context for variable substitution with three-level precedence */
export interface VariableContext {
  /** --set KEY=VALUE overrides (highest priority) */
  setOverrides: Record<string, string>;
  /** --values file contents (medium priority) */
  valuesFile: Record<string, string>;
  /** Environment variables (lowest priority) */
  env: Record<string, string | undefined>;
}

/** Information about an unresolved variable */
export interface UnresolvedVariableError {
  variable: string;
  file: string;
  line: number;
}

/** Default variable context using process.env */
const defaultContext: VariableContext = {
  setOverrides: {},
  valuesFile: {},
  env: process.env as Record<string, string | undefined>,
};

/**
 * Substitute ${VAR} and ${VAR:-default} patterns in raw text.
 *
 * Precedence: setOverrides > valuesFile > env > default value.
 * If no value found and no default, the pattern is left unresolved.
 */
export function substituteVariables(rawText: string, ctx: VariableContext): string {
  // Match ${VAR} and ${VAR:-default}
  const regex = /\$\{([^}:]+)(?::-((?:[^}\\]|\\.)*)?)?\}/g;

  return rawText.replace(regex, (_match, rawName: string, defaultVal: string | undefined) => {
    const name = rawName.trim();

    // Check precedence chain
    if (name in ctx.setOverrides) {
      return ctx.setOverrides[name];
    }
    if (name in ctx.valuesFile) {
      return ctx.valuesFile[name];
    }
    if (name in ctx.env && ctx.env[name] !== undefined) {
      return ctx.env[name] as string;
    }

    // Use default if provided
    if (defaultVal !== undefined) {
      return defaultVal;
    }

    // Leave unresolved
    return _match;
  });
}

/**
 * Detect remaining ${...} patterns after substitution.
 * Returns array of unresolved variable info with 1-indexed line numbers.
 */
export function detectUnresolvedVariables(
  text: string,
  filePath: string
): UnresolvedVariableError[] {
  const errors: UnresolvedVariableError[] = [];
  const lines = text.split("\n");
  const varRegex = /\$\{([^}]+)\}/g;

  for (let i = 0; i < lines.length; i++) {
    varRegex.lastIndex = 0;
    let match = varRegex.exec(lines[i]);
    while (match !== null) {
      // Extract the variable name (strip :-default part if present)
      const fullMatch = match[1];
      const varName = fullMatch.split(":-")[0].trim();
      errors.push({
        variable: varName,
        file: filePath,
        line: i + 1, // 1-indexed
      });
      match = varRegex.exec(lines[i]);
    }
  }

  return errors;
}

/**
 * Parse a YAML string into typed YamlResource[].
 *
 * Pipeline:
 * 1. Variable substitution on raw text (if ctx provided)
 * 2. Detect unresolved variables (throw if any)
 * 3. Parse all documents with parseAllDocuments
 * 4. Validate and construct each document
 */
export function parseYamlString(
  content: string,
  ctx?: VariableContext,
  sourcePath?: string
): YamlResource[] {
  const effectiveCtx = ctx ?? defaultContext;
  const filePath = sourcePath ?? "<inline>";

  // Step 1: Variable substitution on raw text
  const substituted = substituteVariables(content, effectiveCtx);

  // Step 2: Detect unresolved variables
  const unresolved = detectUnresolvedVariables(substituted, filePath);
  if (unresolved.length > 0) {
    const details = unresolved.map((u) => `\${${u.variable}} at ${u.file}:${u.line}`).join(", ");
    throw new YamlParseError(`Unresolved variables: ${details}`);
  }

  // Step 3: Parse all documents
  const docs = parseAllDocuments(substituted);

  // Check for YAML syntax errors
  for (const doc of docs) {
    if (doc.errors && doc.errors.length > 0) {
      const errMsg = doc.errors.map((e) => e.message).join("; ");
      throw new YamlParseError(`YAML syntax error in ${filePath}: ${errMsg}`);
    }
  }

  // Step 4: Validate and construct each document
  const resources: YamlResource[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];

    // Skip empty documents (trailing --- or empty content)
    if (!doc.contents || doc.contents === null) {
      continue;
    }

    const parsed = doc.toJS() as Record<string, unknown>;

    // Skip null/undefined/empty parsed results
    if (!parsed || typeof parsed !== "object") {
      continue;
    }

    // Validate required fields
    if (!parsed.apiVersion || typeof parsed.apiVersion !== "string") {
      throw new YamlParseError(`Missing or invalid 'apiVersion' in document ${i} of ${filePath}`);
    }
    if (!parsed.kind || typeof parsed.kind !== "string") {
      throw new YamlParseError(`Missing or invalid 'kind' in document ${i} of ${filePath}`);
    }

    const metadata = parsed.metadata as Record<string, unknown> | undefined;
    if (
      !metadata ||
      typeof metadata !== "object" ||
      !metadata.name ||
      typeof metadata.name !== "string"
    ) {
      throw new YamlParseError(
        `Missing or invalid 'metadata.name' in document ${i} of ${filePath}`
      );
    }

    if (!parsed.spec || typeof parsed.spec !== "object") {
      throw new YamlParseError(`Missing or invalid 'spec' in document ${i} of ${filePath}`);
    }

    const resource: YamlResource = {
      apiVersion: parsed.apiVersion as string,
      kind: parsed.kind as string,
      metadata: {
        name: metadata.name as string,
        ...(metadata.labels ? { labels: metadata.labels as Record<string, string> } : {}),
      },
      spec: parsed.spec as Record<string, unknown>,
      _source: {
        file: filePath,
        documentIndex: i,
      },
    };

    resources.push(resource);
  }

  return resources;
}

/**
 * Read and parse a YAML file into typed YamlResource[].
 */
export function parseYamlFile(filePath: string, ctx?: VariableContext): YamlResource[] {
  const content = readFileSync(filePath, "utf8");
  return parseYamlString(content, ctx, filePath);
}

/**
 * Load a values file (YAML mapping) into Record<string, string>.
 * All values are converted to strings with String().
 * Throws YamlParseError if the file contains non-mapping content (arrays, scalars).
 */
export function loadValuesFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf8");
  const parsed = parse(content);

  if (parsed === null || parsed === undefined) {
    throw new YamlParseError(`Values file ${filePath} is empty`);
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new YamlParseError(
      `Values file ${filePath} must contain a YAML mapping (key-value pairs), got ${Array.isArray(parsed) ? "array" : typeof parsed}`
    );
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    result[key] = String(value);
  }

  return result;
}
