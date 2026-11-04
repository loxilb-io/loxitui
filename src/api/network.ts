import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  FDBEntry,
  FDBList,
  IPv4AddressGetEntry,
  IPv4AddressList,
  MirrorGetEntry,
  MirrorList,
  NeighborEntry,
  NeighborList,
  PolicyEntry,
  PolicyList,
  SessionEntry,
  SessionList,
  VlanGetEntry,
  VlanList,
  VxlanBridgeEntry,
  VxlanList,
} from "./models";

export class NetworkApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async listVlans(): Promise<ApiResult<VlanGetEntry[]>> {
    const result = await this.c.get<VlanList>("/config/vlan/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.vlanAttr ?? [] };
  }

  async listVxlans(): Promise<ApiResult<VxlanBridgeEntry[]>> {
    const result = await this.c.get<VxlanList>("/config/tunnel/vxlan/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.vxlanAttr ?? [] };
  }

  async listSessions(): Promise<ApiResult<SessionEntry[]>> {
    const result = await this.c.get<SessionList>("/config/session/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.sessionAttr ?? [] };
  }

  async listPolicies(): Promise<ApiResult<PolicyEntry[]>> {
    const result = await this.c.get<PolicyList>("/config/policy/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.policyAttr ?? [] };
  }

  async listMirrors(): Promise<ApiResult<MirrorGetEntry[]>> {
    const result = await this.c.get<MirrorList>("/config/mirror/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.mirrorAttr ?? [] };
  }

  async listIPv4Addresses(): Promise<ApiResult<IPv4AddressGetEntry[]>> {
    const result = await this.c.get<IPv4AddressList>("/config/ipv4address/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.ipAttr ?? [] };
  }

  async listNeighbors(): Promise<ApiResult<NeighborEntry[]>> {
    const result = await this.c.get<NeighborList>("/config/neighbor/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.neighborAttr ?? [] };
  }

  async listFdb(): Promise<ApiResult<FDBEntry[]>> {
    const result = await this.c.get<FDBList>("/config/fdb/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.fdbAttr ?? [] };
  }
}
