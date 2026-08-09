/**
 * Static metadata for all 35 configurable resource kinds.
 * Maps kind string -> ResourceMetadata with endpoint paths, identity fields, domain groups.
 *
 * Derived from swagger_new.yml POST endpoint analysis. Path shapes verified against
 * the gateway's go-swagger router (which routes exactly the declared spec paths);
 * placeholder names are spec field names substituted by the adapters.
 * getEndpoint/deletePath are null when the gateway declares no such operation.
 */

import type { ResourceMetadata } from "../types.js";

export const RESOURCE_METADATA: Record<string, ResourceMetadata> = {
  // ─── Core ─────────────────────────────────────────────
  LoadBalancer: {
    kind: "LoadBalancer",
    definitionName: "LoadbalanceEntry",
    apiEndpoint: "/config/loadbalancer",
    getEndpoint: "/config/loadbalancer/all",
    deletePath:
      "/config/loadbalancer/externalipaddress/{externalIP}/port/{port}/protocol/{protocol}",
    identityFields: ["externalIP", "port", "protocol"],
    domainGroup: "core",
    hasNestedWrapper: true,
    wrapperField: "serviceArguments",
  },
  Session: {
    kind: "Session",
    definitionName: "SessionEntry",
    apiEndpoint: "/config/session",
    getEndpoint: "/config/session/all",
    deletePath: "/config/session/ident/{ident}",
    identityFields: ["ident"],
    domainGroup: "core",
    hasNestedWrapper: false,
  },
  Endpoint: {
    kind: "Endpoint",
    definitionName: "EndPoint",
    apiEndpoint: "/config/endpoint",
    getEndpoint: "/config/endpoint/all",
    deletePath: "/config/endpoint/epipaddress/{hostName}",
    identityFields: ["hostName"],
    domainGroup: "core",
    hasNestedWrapper: false,
  },
  EndpointHostState: {
    kind: "EndpointHostState",
    definitionName: "EndPointHostState",
    apiEndpoint: "/config/endpointhoststate",
    getEndpoint: null,
    deletePath: null,
    identityFields: ["hostName"],
    domainGroup: "core",
    hasNestedWrapper: false,
    operational: true,
  },

  // ─── Network ──────────────────────────────────────────
  Route: {
    kind: "Route",
    definitionName: "RouteEntry",
    apiEndpoint: "/config/route",
    getEndpoint: "/config/route/all",
    // CIDR is split into /{ip}/{mask} segments by the adapter
    deletePath: "/config/route/destinationIPNet/{ip}/{mask}",
    identityFields: ["destinationIPNet"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  IPv4Address: {
    kind: "IPv4Address",
    definitionName: "IPv4AddressEntry",
    apiEndpoint: "/config/ipv4address",
    getEndpoint: "/config/ipv4address/all",
    // ipAddress CIDR is split into /{ip}/{mask} segments by the adapter
    deletePath: "/config/ipv4address/{ip}/{mask}/dev/{dev}",
    identityFields: ["ipAddress", "dev"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  IPv6Address: {
    kind: "IPv6Address",
    definitionName: "IPv6AddressEntry",
    apiEndpoint: "/config/ipv6address",
    getEndpoint: "/config/ipv6address/all",
    // ipAddress CIDR is split into /{ip}/{mask} segments by the adapter
    deletePath: "/config/ipv6address/{ip}/{mask}/dev/{dev}",
    identityFields: ["ipAddress", "dev"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  Neighbor: {
    kind: "Neighbor",
    definitionName: "NeighborEntry",
    apiEndpoint: "/config/neighbor",
    getEndpoint: "/config/neighbor/all",
    deletePath: "/config/neighbor/{ipAddress}/dev/{dev}",
    identityFields: ["ipAddress", "dev"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  Fdb: {
    kind: "Fdb",
    definitionName: "FDBEntry",
    apiEndpoint: "/config/fdb",
    getEndpoint: "/config/fdb/all",
    deletePath: "/config/fdb/{macAddress}/dev/{dev}",
    identityFields: ["macAddress", "dev"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  Vlan: {
    kind: "Vlan",
    definitionName: "VlanBridgeEntry",
    apiEndpoint: "/config/vlan",
    getEndpoint: "/config/vlan/all",
    deletePath: "/config/vlan/{vid}",
    identityFields: ["vid"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  VlanMember: {
    kind: "VlanMember",
    definitionName: "VlanMemberEntry",
    // vid is a schema augmentation (parent VLAN id, not part of VlanMemberEntry)
    apiEndpoint: "/config/vlan/{vid}/member",
    getEndpoint: null, // derived from /config/vlan/all by the adapter
    deletePath: "/config/vlan/{vid}/member/{dev}/tagged/{tagged}",
    identityFields: ["vid", "dev"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  VxlanTunnel: {
    kind: "VxlanTunnel",
    definitionName: "VxlanBridgeEntry",
    apiEndpoint: "/config/tunnel/vxlan",
    getEndpoint: "/config/tunnel/vxlan/all",
    deletePath: "/config/tunnel/vxlan/{vxlanID}",
    identityFields: ["vxlanID"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },
  VxlanPeer: {
    kind: "VxlanPeer",
    definitionName: "VxlanPeerEntry",
    // vxlanID is a schema augmentation (parent tunnel id, not part of VxlanPeerEntry)
    apiEndpoint: "/config/tunnel/vxlan/{vxlanID}/peer",
    getEndpoint: null, // gateway declares no peer list endpoint
    deletePath: "/config/tunnel/vxlan/{vxlanID}/peer/{peerIP}",
    identityFields: ["vxlanID", "peerIP"],
    domainGroup: "network",
    hasNestedWrapper: false,
  },

  // ─── Security ─────────────────────────────────────────
  Firewall: {
    kind: "Firewall",
    definitionName: "FirewallEntry",
    apiEndpoint: "/config/firewall",
    getEndpoint: "/config/firewall/all",
    deletePath: "/config/firewall",
    identityFields: ["preference"],
    domainGroup: "security",
    hasNestedWrapper: true,
    wrapperField: "ruleArguments",
  },
  IpFilter: {
    kind: "IpFilter",
    definitionName: "IPFilterEntry",
    apiEndpoint: "/config/ipfilter",
    getEndpoint: "/config/ipfilter/all",
    // gateway deletes ipfilter rules via query params, not path segments
    deletePath: "/config/ipfilter?filterType={filterType}&cidr={cidr}",
    identityFields: ["filterType", "cidr"],
    domainGroup: "security",
    hasNestedWrapper: false,
  },
  SecurityRate: {
    kind: "SecurityRate",
    definitionName: "SecurityRateConfigMod",
    apiEndpoint: "/config/securityrate",
    getEndpoint: "/config/securityrate/all",
    deletePath: "/config/securityrate",
    identityFields: [],
    domainGroup: "security",
    hasNestedWrapper: false,
  },

  // ─── BGP ──────────────────────────────────────────────
  BgpNeighbor: {
    kind: "BgpNeighbor",
    definitionName: "BGPNeigh",
    apiEndpoint: "/config/bgp/neigh",
    getEndpoint: "/config/bgp/neigh/all",
    deletePath: "/config/bgp/neigh/{ipAddress}",
    identityFields: ["ipAddress"],
    domainGroup: "bgp",
    hasNestedWrapper: false,
  },
  BgpPolicyDefinedSet: {
    kind: "BgpPolicyDefinedSet",
    definitionName: "BGPPolicyDefinedSetsMod",
    // type is a schema augmentation (defineset type path param, not part of the body model)
    apiEndpoint: "/config/bgp/policy/definedsets/{type}",
    getEndpoint: null, // gateway GET requires {type}/{name}; no list-all endpoint
    deletePath: "/config/bgp/policy/definedsets/{type}/{name}",
    identityFields: ["type", "name"],
    domainGroup: "bgp",
    hasNestedWrapper: false,
  },
  BgpPolicyDefinition: {
    kind: "BgpPolicyDefinition",
    definitionName: "BGPPolicyDefinitionsMod",
    apiEndpoint: "/config/bgp/policy/definitions",
    getEndpoint: "/config/bgp/policy/definitions/all",
    deletePath: "/config/bgp/policy/definitions/{name}",
    identityFields: ["name"],
    domainGroup: "bgp",
    hasNestedWrapper: false,
  },
  BgpPolicyApply: {
    kind: "BgpPolicyApply",
    definitionName: "BGPApplyPolicyToNeighborMod",
    apiEndpoint: "/config/bgp/policy/apply",
    getEndpoint: null, // gateway declares no GET for policy apply
    deletePath: "/config/bgp/policy/apply", // DELETE takes the body, handled by the adapter
    identityFields: ["ipAddress", "policyType"],
    domainGroup: "bgp",
    hasNestedWrapper: false,
  },
  BgpGlobal: {
    kind: "BgpGlobal",
    definitionName: "BGPGlobalConfig",
    apiEndpoint: "/config/bgp/global",
    getEndpoint: null, // POST-only in the gateway API
    deletePath: null,
    identityFields: [],
    domainGroup: "bgp",
    hasNestedWrapper: false,
  },

  // ─── IPsec ────────────────────────────────────────────
  IpsecConfig: {
    kind: "IpsecConfig",
    definitionName: "IPsecConfigMod",
    apiEndpoint: "/config/ipsec",
    getEndpoint: "/config/ipsec",
    deletePath: null, // no DELETE declared for the global IPsec config
    identityFields: [],
    domainGroup: "ipsec",
    hasNestedWrapper: false,
  },
  IpsecTunnel: {
    kind: "IpsecTunnel",
    definitionName: "IPsecTunnelMod",
    apiEndpoint: "/config/ipsec/tunnels",
    getEndpoint: "/config/ipsec/tunnels/all",
    deletePath: "/config/ipsec/tunnels/{name}",
    identityFields: ["name"],
    domainGroup: "ipsec",
    hasNestedWrapper: false,
  },
  IpsecCertificate: {
    kind: "IpsecCertificate",
    definitionName: "IPsecCertificateMod",
    apiEndpoint: "/config/ipsec/certificates",
    getEndpoint: "/config/ipsec/certificates/all",
    deletePath: "/config/ipsec/certificates/{name}",
    identityFields: ["name"],
    domainGroup: "ipsec",
    hasNestedWrapper: false,
  },
  IpsecCaCertificate: {
    kind: "IpsecCaCertificate",
    definitionName: "IPsecCACertificateMod",
    apiEndpoint: "/config/ipsec/ca-certificates",
    getEndpoint: "/config/ipsec/ca-certificates/all",
    deletePath: "/config/ipsec/ca-certificates/{name}",
    identityFields: ["name"],
    domainGroup: "ipsec",
    hasNestedWrapper: false,
  },

  // ─── Observability ────────────────────────────────────
  Bfd: {
    kind: "Bfd",
    definitionName: "BfdEntry",
    apiEndpoint: "/config/bfd",
    getEndpoint: "/config/bfd/all",
    deletePath: "/config/bfd/remoteIP/{remoteIp}",
    identityFields: ["instance", "remoteIp"],
    domainGroup: "observability",
    hasNestedWrapper: false,
  },
  Policy: {
    kind: "Policy",
    definitionName: "PolicyEntry",
    apiEndpoint: "/config/policy",
    getEndpoint: "/config/policy/all",
    deletePath: "/config/policy/ident/{policyIdent}",
    identityFields: ["policyIdent"],
    domainGroup: "observability",
    hasNestedWrapper: false,
  },
  Mirror: {
    kind: "Mirror",
    definitionName: "MirrorEntry",
    apiEndpoint: "/config/mirror",
    getEndpoint: "/config/mirror/all",
    deletePath: "/config/mirror/ident/{mirrorIdent}",
    identityFields: ["mirrorIdent"],
    domainGroup: "observability",
    hasNestedWrapper: false,
  },

  // ─── AI Gateway ───────────────────────────────────────
  AiApiKey: {
    kind: "AiApiKey",
    definitionName: "ApiKeyCreateRequest",
    apiEndpoint: "/config/ai/apikey",
    getEndpoint: "/config/ai/apikey",
    // gateway deletes by server-assigned key_id; the adapter resolves it via the key list
    deletePath: "/config/ai/apikey/{key_id}",
    identityFields: ["tenant_id", "name"],
    domainGroup: "ai-gateway",
    hasNestedWrapper: false,
  },
  AiTenantRateLimit: {
    kind: "AiTenantRateLimit",
    definitionName: "TenantRateLimitMod",
    apiEndpoint: "/config/ai/tenant/ratelimit",
    getEndpoint: null, // gateway GET requires {tenant_id}; no list-all endpoint
    deletePath: null, // no DELETE declared
    identityFields: ["tenant_id"],
    domainGroup: "ai-gateway",
    hasNestedWrapper: false,
  },

  // ─── System ───────────────────────────────────────────
  Params: {
    kind: "Params",
    definitionName: "OperParams",
    apiEndpoint: "/config/params",
    getEndpoint: "/config/params",
    deletePath: null, // no DELETE declared for operational params
    identityFields: [],
    domainGroup: "system",
    hasNestedWrapper: false,
  },
  Cors: {
    kind: "Cors",
    definitionName: "CorsEntry",
    apiEndpoint: "/config/cors",
    getEndpoint: "/config/cors/all",
    // gateway deletes one allowed origin per call; the adapter iterates spec.cors
    deletePath: "/config/cors/{cors_url}",
    identityFields: [],
    domainGroup: "system",
    hasNestedWrapper: false,
  },
  SniCertificate: {
    kind: "SniCertificate",
    definitionName: "SNICertificateEntry",
    apiEndpoint: "/sni/certificates",
    getEndpoint: "/sni/certificates",
    deletePath: "/sni/certificates", // DELETE takes {hostname} in the body, handled by the adapter
    identityFields: ["hostname"],
    domainGroup: "system",
    hasNestedWrapper: false,
  },
  Cert: {
    kind: "Cert",
    definitionName: "Cert",
    apiEndpoint: "/config/cert",
    getEndpoint: null, // gateway GET requires {certId}; no list-all endpoint
    deletePath: "/config/cert/{certId}",
    identityFields: ["certId"],
    domainGroup: "system",
    hasNestedWrapper: false,
  },
  OpaWatcher: {
    kind: "OpaWatcher",
    definitionName: "OPAWatcherConfig",
    apiEndpoint: "/config/opa/watcher",
    getEndpoint: "/config/opa/watcher",
    deletePath: "/config/opa/watcher",
    identityFields: [],
    domainGroup: "system",
    hasNestedWrapper: false,
  },
};

/**
 * Reverse lookup: swagger definition name -> kind string
 */
export const DEFINITION_TO_KIND: Record<string, string> = Object.fromEntries(
  Object.values(RESOURCE_METADATA).map((m) => [m.definitionName, m.kind])
);
