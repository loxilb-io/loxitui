# LoxiLB Kubernetes Integration

<!-- provenance: synced 2026-08-01 against kube-loxilb source (cmd/loxilb-agent/options.go flags, pkg/agent/manager/loadbalancer annotation parsing, manifest/ext-cluster + in-cluster; public repo github.com/loxilb-io/kube-loxilb), loxilb-io/loxilb-inference-gateway (README.md, api/swagger.yml), and LoxiLB inference-gateway docs (docs/concepts/architecture.md, docs/reference/system-requirements.md) -->

**Purpose:** Guide to LoxiLB's Kubernetes integration via the kube-loxilb operator and service type LoadBalancer.

---

## Overview

LoxiLB integrates with Kubernetes through **kube-loxilb**, an operator that implements the Kubernetes LoadBalancer service specification, on any cloud or on-prem environment.

**kube-loxilb** (operator):
- Runs as a Deployment in `kube-system` (single replica sufficient)
- Watches LoadBalancer services, Endpoints/EndpointSlices, Nodes
- Translates services into LoxiLB LB rules via the REST API (`:11111/netlox/v1`)
- Manages IP address allocation (IPAM) and, optionally, instance HA roles (`--setRoles`)
- Coexists with other LB providers via `loadBalancerClass`

**loxilb** (load balancer):
- Runs in-cluster (DaemonSet/Deployment) or external (VM/Docker)
- eBPF data plane; REST API for configuration; endpoint health probes

**Inference gateway note:** `ghcr.io/loxilb-io/loxilb-inference-gateway` is a drop-in for upstream loxilb — all kube-loxilb integration applies unchanged. AI features (model routing, KV-cache routing, P/D) are opt-in per LB rule via fullproxy mode; with none enabled it behaves exactly like upstream loxilb.

---

## Service Type LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
  annotations:
    loxilb.io/lbmode: "fullnat"         # Optional: LB mode override
    loxilb.io/liveness: "yes"           # Optional: enable health probes
    loxilb.io/probetype: "http"         # Optional: probe type
    loxilb.io/probeport: "8080"         # Optional: probe port
spec:
  type: LoadBalancer                     # REQUIRED
  loadBalancerClass: loxilb.io/loxilb    # Routes service to kube-loxilb
  selector:
    app: my-app
  ports:
  - name: http
    port: 80                             # External port (on VIP)
    targetPort: 8080                     # Pod port
    protocol: TCP
  externalTrafficPolicy: Local           # Optional: preserve source IP
```

---

## Service Lifecycle Flow

### 1. Service Creation

```
kubectl apply -f service.yaml
   ↓  K8s API creates Service (status.loadBalancer.ingress pending)
   ↓  kube-loxilb watch event
kube-loxilb service controller:
   1. Filter by loadBalancerClass (loxilb.io/loxilb)
   2. Parse loxilb.io/* annotations (pool, lbmode, liveness, epselect, ...)
   3. Allocate external IP — staticIP annotation, else from pool (defaultPool)
   4. Resolve endpoints — node IPs + NodePort (default) or pod IPs (usePodNetwork)
   5. POST /netlox/v1/config/loadbalancer to every instance in --loxiURL
   ↓
loxilb REST API (:11111):
   - Validates rule, registers it, starts health probes (if liveness)
   - Populates eBPF maps; advertises VIP via BGP if enabled
   ↓
kube-loxilb PATCHes Service status:
   status.loadBalancer.ingress: [{ip: 192.168.1.100}]
```

### 2. Endpoint Updates (scaling / rolling updates)

Pod add/remove or readiness changes → Endpoints/EndpointSlices update → kube-loxilb re-sends the rule with the new endpoint set → loxilb updates eBPF maps; probes start for new endpoints. Terminating pods are marked NotReady and removed from the rule; existing connections drain by TCP FIN/timeout. `--appendEPs` enables incremental endpoint attach/detach.

### 3. Service Deletion

```
kubectl delete service my-app-lb
   ↓
kube-loxilb → DELETE /netlox/v1/config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}
   ↓
loxilb removes eBPF entries, stops probes, withdraws BGP route
kube-loxilb releases the external IP back to the pool
```

---

## Endpoint Discovery Modes

### 1. Default (NodePort endpoints)

Targets `<node-ip>:<nodePort>`; kube-proxy forwards to pods.

- Works with any CNI, no direct pod routing needed
- Extra hop; source IP SNAT'd by kube-proxy
- `externalTrafficPolicy: Cluster` — any node can receive traffic

### 2. Pod Network Mode (direct pod IPs)

```yaml
metadata:
  annotations:
    loxilb.io/usepodnetwork: "yes"
spec:
  externalTrafficPolicy: Local
```

- Targets pod IPs directly (bypasses kube-proxy); also configurable globally with kube-loxilb `--usePodNetwork`
- Requires routing from LoxiLB to the pod CIDR (Calico BGP, Flannel host-gw, in-cluster mode, etc.)
- `externalTrafficPolicy: Local` limits endpoints to nodes with running pods and preserves source IP

### 3. External Endpoints

`loxilb.io/useExternalEndpoint` (or global `--useExternalEndpoint`) targets endpoints outside the cluster.

---

## Multi-Homing Support (SCTP)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sctp-multihoming-service
  annotations:
    loxilb.io/lbmode: "fullnat"                    # Required for SCTP multihoming
    loxilb.io/secondaryIPs: "1.1.1.1,2.2.2.2"      # Static secondary IPs
    # OR: loxilb.io/poolSelectSecondary: "pool2,pool3"
spec:
  type: LoadBalancer
  loadBalancerClass: loxilb.io/loxilb
  ports:
  - port: 56004
    targetPort: 9999
    protocol: SCTP
  selector:
    app: sctp-app
```

Primary + secondary VIPs are all included in the SCTP INIT for path redundancy. **Use case:** 5G core (AMF/SMF) requiring multi-path resilience.

---

## IPAM (IP Address Management)

### Pool Configuration (kube-loxilb args)

```yaml
args:
- --loxiURL=http://loxilb-lb:11111
- --cidrPools=defaultPool=192.168.1.100-192.168.1.200
- --cidrPools=pool-public=203.0.113.0/24
- --cidr6Pools=defaultPool=2001:db8::/96
- --setUniqueIP=false   # false = services may share IPs (default); true = unique IP per service
```

Pool formats: CIDR (`192.168.1.0/24`), range (`192.168.1.100-192.168.1.200`), single IP (`192.168.1.100/32`).

- **Per-service pool:** `loxilb.io/poolSelect: "pool-public"` (pool exhausted → service stays Pending)
- **Static IP:** `loxilb.io/staticIP: "203.0.113.50"` (DNS pre-configured / LB migration)
- **Address family:** `loxilb.io/ipam: "ipv4"|"ipv6"|"ipv6to4"`

---

## CNI Compatibility

LoxiLB works with any CNI; the only requirement is routing from LoxiLB to pod IPs (or node IPs). Validated combinations (upstream CI): k8s / k3s / k0s / kind / OpenShift with Calico, Flannel, Cilium, Weave, Multus, kube-router.

| CNI mode | Pod routing | Notes |
|-----------|-------------|-------|
| Overlay (VXLAN/IPIP/Geneve) | Via node IPs (default mode) | Works everywhere |
| Native routing / BGP (Calico BGP, kube-router) | Direct to pod CIDR | Best performance with `usepodnetwork` |
| Flannel host-gw | Direct (same L2) | Requires L2 adjacency |
| Multus | Per-annotation | `loxilb.io/multus-nets: "macvlan1,macvlan2"` — endpoint IPs taken from the multus networks (SR-IOV/DPDK use cases) |

**External LoxiLB + overlay CNI:** add routes on the LoxiLB node to the pod CIDR via the K8s nodes (or use default NodePort mode, which needs none).

**In-cluster mode:** no extra routing; LoxiLB pods run with `hostNetwork: true` and privileged mode for eBPF.

---

## BGP Integration

```yaml
args:
- --setBGP=65100                               # local AS for loxilb BGP
- --extBGPPeers=10.0.0.1:65101,10.0.0.2:65102  # upstream routers
- --enableBGPCRDs                              # optional: BGP CRD support
# optional: --listenBGPPort=<port>, --eBGPMultiHop
```

When a service is created, each LoxiLB instance advertises the allocated VIP as a `/32` to its peers. In HA clusters, multiple instances advertising the same VIP give ECMP distribution and route-withdrawal failover. See `ha-clustering.md`.

---

## Service Annotations Reference

Verified against the kube-loxilb loadbalancer manager:

| Annotation | Values | Description |
|------------|--------|-------------|
| `loxilb.io/lbmode` | `default`/`onearm`/`fullnat`/`dsr`/`fullproxy`/`hostonearm` | NAT/proxy mode per service (`fullproxy` = L7) |
| `loxilb.io/ipam` | `ipv4`/`ipv6`/`ipv6to4` | Address family for allocation |
| `loxilb.io/poolSelect` | pool name | IP pool for allocation (default `defaultPool`) |
| `loxilb.io/poolSelectSecondary` | pool names | Secondary pools (SCTP multihoming) |
| `loxilb.io/staticIP` | IP | Static external IP |
| `loxilb.io/secondaryIPs` | IP,IP | Static secondary IPs (SCTP multihoming) |
| `loxilb.io/liveness` | `yes`/`no` | Enable endpoint health probes |
| `loxilb.io/probetype` | `ping`/`udp`/`tcp`/`http`/`https`/`none` | Probe protocol |
| `loxilb.io/probeport` | int | Probe port |
| `loxilb.io/probereq` / `loxilb.io/proberesp` | string | HTTP probe request path / expected response |
| `loxilb.io/probetimeout` / `loxilb.io/proberetries` | int | Probe timeout (s) / retries |
| `loxilb.io/epselect` | `rr`/`hash`/`persist`/`lc`/`n2`/`n2det`/`n3` | Endpoint selection algorithm (default `rr`) |
| `loxilb.io/timeout` | int | Session idle timeout (seconds) |
| `loxilb.io/usepodnetwork` | `yes`/`no` | Use pod IPs instead of node IPs |
| `loxilb.io/useExternalEndpoint` | `yes`/`no` | Target external (non-cluster) endpoints |
| `loxilb.io/multus-nets` | names | Comma-separated Multus network names |
| `loxilb.io/useproxyprotov2` | `yes`/`no` | Proxy Protocol v2 (client IP with fullnat) |
| `loxilb.io/egress` | `yes`/`no` | Egress rule handling |
| `loxilb.io/prefLocalPod` | `yes`/`no` | Prefer node-local pods |
| `loxilb.io/nodelabel` | label | Restrict endpoint nodes by label |
| `loxilb.io/zoneselect` / `loxilb.io/zonelabel` / `loxilb.io/zoneinstance` | — | Zone-based instance selection |
| `loxilb.io/mtls-frontend-*` / `loxilb.io/mtls-backend-*` | — | mTLS secret/verification settings (frontend mode/secret/CN, backend CA/client secret/verify) |

Comprehensive examples: see `configuration-patterns.md`.

---

## Multi-Cluster & Zones

- Deploy a kube-loxilb per cluster, pointing at shared LoxiLB instances; keep IP pools disjoint per cluster.
- `--zone=<name>` and `--numZoneInstances=<n>` shard services across zone-scoped LoxiLB instance groups; `--noZoneName` suppresses the zone prefix in external IP naming.
- `--gatewayAPI` enables the Gateway API managers; `--enableK8sMetadata` syncs K8s metadata to loxilb.

---

## Troubleshooting

### External IP Stuck in Pending

```bash
kubectl logs -n kube-system deployment/kube-loxilb
kubectl describe service my-app-lb
curl http://<loxilb-ip>:11111/netlox/v1/config/loadbalancer/all
```

Common causes: wrong `--loxiURL`, no network path kube-loxilb → loxilb, IP pool exhausted, missing/mismatched `loadBalancerClass`.

### Endpoints Not Updated

```bash
kubectl get endpoints my-app-lb
kubectl logs -n kube-system deployment/kube-loxilb | grep -i endpoint
```

Common causes: pods not Ready, selector mismatch, missing RBAC for endpointslices.

### Traffic Not Reaching Pods

```bash
loxicmd get lb -o wide     # rule exists? endpoints active?
loxicmd get endpoint       # probe states
loxicmd get conntrack      # connections being created?
tcpdump -i any host <vip> -nn
```

Common causes: no route from LoxiLB to pod network, firewall, all endpoints failing probes, wrong targetPort.

---

## Security

### RBAC

kube-loxilb's shipped ClusterRole covers: core `nodes`, `pods`, `services` (+`services/status`), `endpoints`, `discovery.k8s.io/endpointslices`, plus CRDs when enabled (BGP peer/policy, gateway API resources). Use the manifest from the repo rather than hand-writing: https://github.com/loxilb-io/kube-loxilb/tree/main/manifest

### API Authentication

When LoxiLB runs with an auth mode (`--userservice` / `--oauth2` / manual token), API calls require `Authorization: Bearer <token>`; enable TLS on the API (`--tls`, port 8091) for production. Note `--tls` does not close the plain `:11111` listener — firewall it.

---

## Migration from Other Load Balancers

**From MetalLB:** deploy kube-loxilb alongside; switch services by setting `loadBalancerClass: loxilb.io/loxilb`. Multiple LB providers coexist via loadBalancerClass. Use `loxilb.io/staticIP` to keep existing IPs.

**From cloud provider LBs:** predictable cost, SCTP/multi-protocol support, BYOIP, consistent behavior across clouds. Patch services incrementally, then cut DNS over.

---

## Further Reading

- **Architecture:** `architecture.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **API Reference:** `api-quick-reference.md`
- **Troubleshooting:** `troubleshooting.md`
- **kube-loxilb source & manifests:** https://github.com/loxilb-io/kube-loxilb
- **Official docs:** https://docs.loxilb.io/
