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
