export { LoxilbApiClient } from "./client";
export type { ClientConfig, ApiError, ApiResult } from "./client";
export { LbApi } from "./lb";
export { EndpointApi } from "./endpoint";
export { ConntrackApi } from "./conntrack";
export { ClusterApi } from "./cluster";
export { RouteApi } from "./route";
export { StatusApi } from "./status";
export { TraceApi } from "./trace";
export { LogApi } from "./log";
export type { LogResponse } from "./log";
export { PortsApi } from "./ports";
export { SecurityApi } from "./security";
export { BgpApi } from "./bgp";
export { BfdApi } from "./bfd";
export { NetworkApi } from "./network";
export { IpsecApi } from "./ipsec";
export { AiGatewayApi } from "./ai";
export { AuthApi, AuthSession, jwtExpiry } from "./auth";
export type { AuthMode, AuthState } from "./auth";
export { ConfigLifecycleApi } from "./lifecycle";
export * from "./models";

import { AiGatewayApi } from "./ai";
import { AuthApi } from "./auth";
import { BfdApi } from "./bfd";
import { BgpApi } from "./bgp";
import { LoxilbApiClient } from "./client";
import type { ClientConfig } from "./client";
import { ClusterApi } from "./cluster";
import { ConntrackApi } from "./conntrack";
import { EndpointApi } from "./endpoint";
import { IpsecApi } from "./ipsec";
import { LbApi } from "./lb";
import { ConfigLifecycleApi } from "./lifecycle";
import { LogApi } from "./log";
import { NetworkApi } from "./network";
import { PortsApi } from "./ports";
import { RouteApi } from "./route";
import { SecurityApi } from "./security";
import { StatusApi } from "./status";
import { TraceApi } from "./trace";

/** Convenience facade — create once, access all domain clients via `.lb`, `.ep`, etc. */
export class LoxilbApi {
  readonly raw: LoxilbApiClient;
  readonly lb: LbApi;
  readonly ep: EndpointApi;
  readonly ct: ConntrackApi;
  readonly cluster: ClusterApi;
  readonly route: RouteApi;
  readonly status: StatusApi;
  readonly trace: TraceApi;
  readonly log: LogApi;
  readonly ports: PortsApi;
  readonly security: SecurityApi;
  readonly bgp: BgpApi;
  readonly bfd: BfdApi;
  readonly network: NetworkApi;
  readonly ipsec: IpsecApi;
  readonly aiGateway: AiGatewayApi;
  readonly auth: AuthApi;
  readonly lifecycle: ConfigLifecycleApi;

  constructor(cfg: ClientConfig) {
    this.raw = new LoxilbApiClient(cfg);
    this.lb = new LbApi(this.raw);
    this.ep = new EndpointApi(this.raw);
    this.ct = new ConntrackApi(this.raw);
    this.cluster = new ClusterApi(this.raw);
    this.route = new RouteApi(this.raw);
    this.status = new StatusApi(this.raw);
    this.trace = new TraceApi(this.raw);
    this.log = new LogApi(this.raw);
    this.ports = new PortsApi(this.raw);
    this.security = new SecurityApi(this.raw);
    this.bgp = new BgpApi(this.raw);
    this.bfd = new BfdApi(this.raw);
    this.network = new NetworkApi(this.raw);
    this.ipsec = new IpsecApi(this.raw);
    this.aiGateway = new AiGatewayApi(this.raw);
    this.auth = new AuthApi(this.raw);
    this.lifecycle = new ConfigLifecycleApi(this.raw);
  }
}
