/**
 * LoadBalancer adapter — handles serviceArguments wrapper, enum conversion,
 * and endpoint-level computed field stripping.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { YamlResource } from "../../types.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class LoadBalancerAdapter extends BaseResourceAdapter {
  constructor() {
    super("LoadBalancer");
  }

  protected computedFields(): string[] {
    // Endpoint-level computed fields are stripped in normalizeGetResponse override
    return [];
  }

  /**
   * Rules on one VIP/port/protocol can differ only by model_name, so a named model
   * extends the key; a rule without one keeps the plain VIP/port/protocol key.
   */
  override extractIdentityKey(spec: Record<string, unknown>): string {
    const key = super.extractIdentityKey(spec);
    const model = (spec.serviceArguments as Record<string, unknown> | undefined)?.model_name;
    return model ? `${key}/${model}` : key;
  }

  /** model_name is part of the rule key — append it only when the rule names a model. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    let path = super.buildDeletePath(spec);
    const model = (spec.serviceArguments as Record<string, unknown> | undefined)?.model_name;
    if (model) path += `?model_name=${encodeURIComponent(String(model))}`;
    return path;
  }

  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(apiItem);

    // Strip endpoint-level computed fields
    const endpoints = result.endpoints as Record<string, unknown>[] | undefined;
    if (Array.isArray(endpoints)) {
      for (const ep of endpoints) {
        delete ep.counter;
        delete ep.state;
      }
    }

    // Strip the read-only *_effective state the gateway reports back
    const sa = result.serviceArguments as Record<string, unknown> | undefined;
    if (sa) {
      delete sa.half_close_effective;
      delete sa.fc_effective;
      delete sa.backend_tls_effective;
    }

    // Convert enums from API integers to strings
    this.convertEnumsFromApi(this.kind, result);
    return result;
  }

  override toApiBody(spec: Record<string, unknown>): Record<string, unknown> {
    const body = structuredClone(spec);
    this.convertEnumsToApi(this.kind, body);
    return body;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.lb.list();
    if (!result.ok) return result as ApiResult<NormalizedResource[]>;

    const normalized: NormalizedResource[] = result.data.map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        kind: this.kind,
        identityKey: this.extractIdentityKey(raw),
        spec: this.normalizeGetResponse(raw),
      };
    });

    return { ok: true, data: normalized };
  }

  override async create(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const body = this.toApiBody(resource.spec);
    return api.raw.post(this.metadata.apiEndpoint, body) as Promise<ApiResult<void>>;
  }

  override async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const deletePath = this.buildDeletePath(resource.spec);
    return api.raw.del(deletePath) as Promise<ApiResult<void>>;
  }
}

adapterRegistry.register(new LoadBalancerAdapter());
