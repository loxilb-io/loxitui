/**
 * Cors adapter — singleton whose spec.cors lists allowed origins.
 * GET /config/cors/all returns the singleton entry; DELETE removes
 * one origin per call, so delete iterates the list.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { YamlResource } from "../../types.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class CorsAdapter extends BaseResourceAdapter {
  constructor() {
    super("Cors");
  }
  protected computedFields(): string[] {
    return [];
  }

  /** The GET response is the singleton CorsEntry itself, not an item list. */
  protected override extractItems(
    responseData: Record<string, unknown>
  ): Record<string, unknown>[] {
    return [responseData];
  }

  override async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const origins = Array.isArray(resource.spec.cors) ? (resource.spec.cors as unknown[]) : [];
    for (const origin of origins) {
      const result = await api.raw.del(`/config/cors/${encodeURIComponent(String(origin))}`);
      if (!result.ok) return result as ApiResult<void>;
    }
    return { ok: true, data: undefined };
  }
}

adapterRegistry.register(new CorsAdapter());
