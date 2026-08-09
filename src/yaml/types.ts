/**
 * Core type definitions for the YAML config management system.
 * Used across all YAML engine components: parser, validator, registry, adapters.
 */

/** Domain grouping for organizing resource kinds in the TUI and export */
export type DomainGroup =
  | "core"
  | "network"
  | "security"
  | "bgp"
  | "ipsec"
  | "ai-gateway"
  | "observability"
  | "system";

/** A parsed YAML resource document */
export interface YamlResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec: Record<string, unknown>;
  _source?: {
    file: string;
    documentIndex: number;
  };
}

/** Static metadata for a resource kind (endpoint, identity, domain) */
export interface ResourceMetadata {
  kind: string;
  definitionName: string;
  apiEndpoint: string;
  /** null when the gateway API declares no GET endpoint for this kind */
  getEndpoint: string | null;
  /** null when the gateway API declares no DELETE endpoint for this kind */
  deletePath: string | null;
  identityFields: string[];
  domainGroup: DomainGroup;
  hasNestedWrapper: boolean;
  wrapperField?: string;
  operational?: boolean;
}

/** Full resource schema: metadata + JSON Schema + enum maps */
export interface ResourceSchema extends ResourceMetadata {
  jsonSchema: object;
  enumMaps: Record<string, Record<string | number, string | number>>;
}

/** Bidirectional enum map entry for integer <-> string conversion */
export interface EnumMapEntry {
  toApi: Record<string, number>;
  fromApi: Record<number, string>;
}

/** A single validation error from schema or semantic layer */
export interface ValidationError {
  resourceName: string;
  kind: string;
  fieldPath: string;
  message: string;
  suggestion: string;
  layer: "schema" | "semantic";
}

/** Validation result for a single resource */
export interface ResourceValidationResult {
  resourceName: string;
  kind: string;
  valid: boolean;
  errors: ValidationError[];
}

/** Validation result for an entire file (may contain multiple resources) */
export interface FileValidationResult {
  filePath: string;
  resources: ResourceValidationResult[];
  parseError?: string;
}
