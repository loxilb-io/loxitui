/**
 * SniCertificate adapter — uses api.security.listSNICertificates().
 * DELETE /sni/certificates takes {hostname} in the request body.
 */
import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { YamlResource } from "../../types.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class SniCertificateAdapter extends BaseResourceAdapter {
  constructor() {
    super("SniCertificate");
  }
  protected computedFields(): string[] {
    return [];
  }

  override async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    return api.raw.del("/sni/certificates", {
      hostname: resource.spec.hostname,
    }) as Promise<ApiResult<void>>;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.security.listSNICertificates();
    if (!result.ok) return result as ApiResult<NormalizedResource[]>;
    return {
      ok: true,
      data: result.data.map((item) => {
        const raw = item as unknown as Record<string, unknown>;
        return {
          kind: this.kind,
          identityKey: this.extractIdentityKey(raw),
          spec: this.normalizeGetResponse(raw),
        };
      }),
    };
  }
}

adapterRegistry.register(new SniCertificateAdapter());
