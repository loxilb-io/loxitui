import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  CorsEntry,
  CorsList,
  FirewallEntry,
  IPFilterEntry,
  IPFilterList,
  SNICertificateEntry,
  SNICertificateList,
  SecurityRateEntry,
  SecurityRateList,
} from "./models";

interface FirewallList {
  fwAttr?: FirewallEntry[];
}

export class SecurityApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async listFirewall(): Promise<ApiResult<FirewallEntry[]>> {
    const result = await this.c.get<FirewallList>("/config/firewall/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.fwAttr ?? [] };
  }

  async listIPFilter(): Promise<ApiResult<IPFilterEntry[]>> {
    const result = await this.c.get<IPFilterList>("/config/ipfilter/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.ipFilterAttr ?? [] };
  }

  async listSecurityRate(): Promise<ApiResult<SecurityRateEntry[]>> {
    const result = await this.c.get<SecurityRateList>("/config/securityrate/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.securityRateAttr ?? [] };
  }

  async listSNICertificates(): Promise<ApiResult<SNICertificateEntry[]>> {
    const result = await this.c.get<SNICertificateList>("/sni/certificates");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.sniAttr ?? [] };
  }

  async listCORS(): Promise<ApiResult<CorsEntry[]>> {
    const result = await this.c.get<CorsList>("/config/cors/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.corsAttr ?? [] };
  }
}
