/**
 * Abstract base class for resource adapters.
 * Handles common patterns: enum conversion, identity key extraction,
 * computed field stripping, wrapper field unwrapping, and default CRUD.
 *
 * Subclasses only need to implement computedFields() and optionally
 * override fieldMap(), toApiBody(), or extractItems() for kind-specific behavior.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { ENUM_MAPS } from "../schema/enum-maps.js";
import { schemaRegistry } from "../schema/registry.js";
import type { ResourceMetadata, YamlResource } from "../types.js";
import type { NormalizedResource, ResourceAdapter } from "./types.js";

export abstract class BaseResourceAdapter implements ResourceAdapter {
  readonly kind: string;
  readonly metadata: ResourceMetadata;

  constructor(kind: string) {
    this.kind = kind;
    const schema = schemaRegistry.lookup(kind);
    if (!schema) {
      throw new Error(`Unknown kind: ${kind}`);
    }
    this.metadata = schema;
  }

  /**
   * Return field names that are computed/read-only from GET responses.
   * These are stripped during normalizeGetResponse.
   * Subclasses MUST implement this.
   */
  protected abstract computedFields(): string[];

  /**
   * Optional YAML-to-API field name mapping.
   * Default: no remapping. Subclasses override for translation.
   */
  protected fieldMap(): Record<string, string> {
    return {};
  }

  /**
   * Normalize a GET response item: strip computed fields, convert enums from integers.
   */
  normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(apiItem);
    const computed = this.computedFields();
    for (const field of computed) {
      this.deleteNestedField(result, field);
    }
    this.convertEnumsFromApi(this.kind, result);
    return result;
  }

  /**
   * Extract identity key from spec.
   * - Singletons (no identity fields): returns kind name.
   * - Wrapper resources: looks inside wrapper field.
   * - Flat resources: reads directly from spec.
   * Multiple identity fields are joined with '/'.
   */
  extractIdentityKey(spec: Record<string, unknown>): string {
    const { identityFields, hasNestedWrapper, wrapperField } = this.metadata;

    if (identityFields.length === 0) {
      return this.kind;
    }

    const values: string[] = [];
    for (const field of identityFields) {
      let value: unknown;
      if (hasNestedWrapper && wrapperField) {
        const wrapper = spec[wrapperField] as Record<string, unknown> | undefined;
        value = wrapper?.[field] ?? spec[field];
      } else {
        value = spec[field];
      }
      values.push(String(value ?? ""));
    }

    return values.join("/");
  }

  /**
   * Convert YAML spec to API request body.
   * Default: clone and convert string enums to integers.
   * Subclasses override for wrapper wrapping or other transformations.
   */
  toApiBody(spec: Record<string, unknown>): Record<string, unknown> {
    const body = structuredClone(spec);
    this.convertEnumsToApi(this.kind, body);
    return body;
  }

  /**
   * Create a resource via POST to the API endpoint.
   * Path placeholders (e.g. /config/vlan/{vid}/member) are filled from spec values.
   */
  async create(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const body = this.toApiBody(resource.spec);
    const endpoint = this.substitutePathParams(this.metadata.apiEndpoint, resource.spec);
    return api.raw.post(endpoint, body) as Promise<ApiResult<void>>;
  }

  /**
   * Delete a resource by constructing the delete path with identity field substitution.
   */
  async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    if (!this.metadata.deletePath) {
      return {
        ok: false,
        error: {
          status: 405,
          message: `${this.kind}: the gateway API declares no DELETE endpoint for this kind`,
          url: this.metadata.apiEndpoint,
        },
      };
    }
    const deletePath = this.buildDeletePath(resource.spec);
    return api.raw.del(deletePath) as Promise<ApiResult<void>>;
  }

  /**
   * Fetch all resources of this kind from the GET endpoint.
   * Kinds without a GET endpoint report empty live state (POST is upsert,
   * so the diff engine treats every desired resource as CREATE).
   */
  async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    if (!this.metadata.getEndpoint) {
      return { ok: true, data: [] };
    }
    const result = await api.raw.get<Record<string, unknown>>(this.metadata.getEndpoint);
    if (!result.ok) {
      return result as ApiResult<NormalizedResource[]>;
    }

    const items = this.extractItems(result.data);
    const normalized: NormalizedResource[] = items.map((item) => ({
      kind: this.kind,
      identityKey: this.extractIdentityKey(item),
      spec: this.normalizeGetResponse(item),
    }));

    return { ok: true, data: normalized };
  }

  /**
   * Extract items array from GET response data.
   * Default: if array, return it; if object with single array-valued key, return that;
   * otherwise wrap as singleton array.
   */
  protected extractItems(responseData: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(responseData)) {
      return responseData as Record<string, unknown>[];
    }

    // Object with keys — find array-valued key
    const keys = Object.keys(responseData);
    for (const key of keys) {
      if (Array.isArray(responseData[key])) {
        return responseData[key] as Record<string, unknown>[];
      }
    }

    // Singleton response
    return [responseData];
  }

  /**
   * Build the delete path by substituting {field} placeholders with spec values.
   */
  protected buildDeletePath(spec: Record<string, unknown>): string {
    return this.substitutePathParams(this.metadata.deletePath ?? "", spec);
  }

  /**
   * Substitute {field} placeholders in a path template with spec values
   * (looking inside the wrapper field when the kind uses one).
   */
  protected substitutePathParams(template: string, spec: Record<string, unknown>): string {
    const { hasNestedWrapper, wrapperField } = this.metadata;

    return template.replace(/\{(\w+)\}/g, (_match, field: string) => {
      let value: unknown;
      if (hasNestedWrapper && wrapperField) {
        const wrapper = spec[wrapperField] as Record<string, unknown> | undefined;
        value = wrapper?.[field] ?? spec[field];
      } else {
        value = spec[field];
      }
      return encodeURIComponent(String(value ?? ""));
    });
  }

  /**
   * Convert string enum values to integers for API submission.
   * Iterates ENUM_MAPS entries matching this kind's prefix.
   */
  protected convertEnumsToApi(kind: string, obj: Record<string, unknown>): void {
    const prefix = `${kind}.`;
    for (const [fieldPath, entry] of Object.entries(ENUM_MAPS)) {
      if (!fieldPath.startsWith(prefix)) continue;
      const dotPath = fieldPath.slice(prefix.length);
      const current = this.getNestedValue(obj, dotPath);
      if (typeof current === "string" && current in entry.toApi) {
        this.setNestedValue(obj, dotPath, entry.toApi[current]);
      }
    }
  }

  /**
   * Convert integer enum values back to strings from API responses.
   * Iterates ENUM_MAPS entries matching this kind's prefix.
   */
  protected convertEnumsFromApi(kind: string, obj: Record<string, unknown>): void {
    const prefix = `${kind}.`;
    for (const [fieldPath, entry] of Object.entries(ENUM_MAPS)) {
      if (!fieldPath.startsWith(prefix)) continue;
      const dotPath = fieldPath.slice(prefix.length);
      const current = this.getNestedValue(obj, dotPath);
      if (typeof current === "number" && current in entry.fromApi) {
        this.setNestedValue(obj, dotPath, entry.fromApi[current]);
      }
    }
  }

  /**
   * Get a nested value from an object using a dotted path.
   */
  private getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
    const parts = dotPath.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Set a nested value in an object using a dotted path.
   */
  private setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
    const parts = dotPath.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] == null || typeof current[part] !== "object") return;
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Delete a field from an object, supporting dotted paths for nested fields.
   */
  private deleteNestedField(obj: Record<string, unknown>, field: string): void {
    if (field.includes(".")) {
      const parts = field.split(".");
      let current: Record<string, unknown> = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] == null || typeof current[parts[i]] !== "object") return;
        current = current[parts[i]] as Record<string, unknown>;
      }
      delete current[parts[parts.length - 1]];
    } else {
      delete obj[field];
    }
  }
}
