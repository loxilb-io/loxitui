/**
 * Core type definitions for the resource adapter layer.
 * ResourceAdapter defines the contract that all per-kind adapters implement.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { ResourceMetadata, YamlResource } from "../types.js";

/** A normalized resource returned from GET endpoints */
export interface NormalizedResource {
  kind: string;
  identityKey: string;
  spec: Record<string, unknown>;
}

/** Result type for adapter getAll operations */
export interface AdapterGetResult {
  resources: NormalizedResource[];
}

/**
 * Contract for per-kind resource adapters.
 * Each adapter knows how to translate between YAML spec and API body,
 * extract identity keys, and perform CRUD via the LoxilbApi facade.
 */
export interface ResourceAdapter {
  readonly kind: string;
  readonly metadata: ResourceMetadata;

  /** Fetch all resources of this kind from the API */
  getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>>;

  /** Create a resource via the API */
  create(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>>;

  /** Delete a resource via the API */
  delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>>;

  /** Convert YAML spec to API request body (enum conversion, wrapper wrapping) */
  toApiBody(spec: Record<string, unknown>): Record<string, unknown>;

  /** Normalize a GET response item (strip computed fields, convert enums from integers) */
  normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown>;

  /** Extract the identity key string from a spec (e.g., "10.0.0.1/80/tcp") */
  extractIdentityKey(spec: Record<string, unknown>): string;
}
