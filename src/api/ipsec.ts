import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  IPsecCertificate,
  IPsecCertificateList,
  IPsecSA,
  IPsecSAList,
  IPsecStats,
  IPsecTunnel,
  IPsecTunnelList,
} from "./models";

export class IpsecApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async listTunnels(): Promise<ApiResult<IPsecTunnel[]>> {
    const result = await this.c.get<IPsecTunnelList>("/config/ipsec/tunnels/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.tunnels ?? [] };
  }

  async listSAs(): Promise<ApiResult<IPsecSA[]>> {
    const result = await this.c.get<IPsecSAList>("/config/ipsec/sas/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.sas ?? [] };
  }

  async getStats(): Promise<ApiResult<IPsecStats>> {
    return this.c.get<IPsecStats>("/config/ipsec/stats");
  }

  async listCertificates(): Promise<ApiResult<IPsecCertificate[]>> {
    const result = await this.c.get<IPsecCertificateList>("/config/ipsec/certificates/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.certificates ?? [] };
  }
}
