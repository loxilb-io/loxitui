/**
 * AiApiKey adapter — the gateway deletes keys by server-assigned key_id,
 * which the YAML spec does not carry; delete resolves it from the key list
 * by (tenant_id, name). GET returns ApiKeySummary items whose server-side
 * fields are stripped for diffing.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { YamlResource } from "../../types.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiApiKeyAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiApiKey");
  }
  protected computedFields(): string[] {
    return ["key_id", "created_at"];
  }

  override async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const tenantId = String(resource.spec.tenant_id ?? "");
    const name = resource.spec.name;
    const list = await api.raw.get<Record<string, unknown>>(
      `/config/ai/apikey?tenant_id=${encodeURIComponent(tenantId)}`
    );
    if (!list.ok) return list as ApiResult<void>;

    const keys = this.extractItems(list.data);
    const match = keys.find((k) => k.tenant_id === tenantId && (name == null || k.name === name));
    if (!match?.key_id) {
      return {
        ok: false,
        error: {
          status: 404,
          message: `AiApiKey: no key found for tenant "${tenantId}"${name ? ` with name "${name}"` : ""}`,
          url: this.metadata.apiEndpoint,
        },
      };
    }

    return api.raw.del(`/config/ai/apikey/${encodeURIComponent(String(match.key_id))}`) as Promise<
      ApiResult<void>
    >;
  }
}

adapterRegistry.register(new AiApiKeyAdapter());
