# LoxiLB Architecture Overview

<!-- provenance: synced 2026-08-01 against loxilbdocs-inference-gateway docs/index.md, docs/concepts/architecture.md, docs/concepts/running-modes.md, docs/getting-started/installation.md, docs/operations/monitoring.md, loxilb-inference-gateway README.md, and loxitui swagger_new.yml -->

**Purpose:** Guide to LoxiLB's system architecture, components, and deployment models, including the inference-gateway (AI/LLM) extensions.

---

## What is LoxiLB?

LoxiLB is an open-source cloud-native load balancer based on GoLang and eBPF, designed for cross-compatibility across on-prem, public cloud, and hybrid Kubernetes environments, with roots in telco, mobility, and edge computing workloads (SCTP multi-homing, 5G interfaces).

**LoxiLB Inference Gateway** (github.com/loxilb-io/loxilb-inference-gateway) is a fork of loxilb that adds AI-inference routing for LLM serving engines (vLLM, SGLang) on top of the same GoLang/eBPF data path. Every AI capability is opt-in per load-balancer rule; with none enabled it behaves exactly like upstream loxilb. License: Apache-2.0.

### Key Design Principles

1. **eBPF-based L4 data plane** — kernel-level fast path for NAT, conntrack, forwarding
2. **Userspace L7 fullproxy** — `mode: 4` terminates HTTP/TLS for content-aware (incl. AI) routing
3. **Cloud-native first** — Kubernetes service type LoadBalancer via kube-loxilb
4. **Opt-in AI routing** — model-name routing, KV-cache-aware routing, P/D disaggregation, SSE-aware streaming, MCP gateway
5. **Deployment flexibility** — in-cluster or external, any CNI, any cloud, single container

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  kube-loxilb (operator, kube-system)                    │    │
│  │  - Watches services/endpoints/nodes, implements         │    │
│  │    LoadBalancer spec, IPAM                              │    │
│  └─────────────────┬──────────────────────────────────────┘    │
└────────────────────┼────────────────────────────────────────────┘
                     │ REST API (:11111 /netlox/v1)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              loxilb (Core Load Balancer)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Control Plane (GoLang)                                   │  │
│  │  - REST API server (:11111, optional TLS :8091)           │  │
│  │  - Rule engine, endpoint health probing                   │  │
│  │  - KV-cache selector · P/D coordinator (inference fork)   │  │
│  │  - HA state (BFD/cistate), eBPF map programming           │  │
│  └────────┬─────────────────────────────┬───────────────────┘  │
│           ▼                             ▼                       │
│  ┌─────────────────┐         ┌───────────────────────────┐     │
│  │  goBGP          │         │  Data Plane               │     │
│  │  Routing stack  │         │  - eBPF (XDP + TC): L4    │     │
│  │  - BGP peers    │         │    NAT/CT/forwarding      │     │
│  │  - Route advert │         │  - sockproxy/fullproxy:   │     │
│  └─────────────────┘         │    userspace L7 HTTP/TLS  │     │
│                              └───────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                     ▲
            ┌────────┴────────┐
            │ loxicmd (CLI)   │  + loxitui (TUI) + REST clients
            └─────────────────┘
```

### 1. loxilb (Core Load Balancer)

**Location:** In-cluster (DaemonSet/Deployment) or external node/VM (Docker container)
**Architecture:** Control plane (GoLang) + data plane (eBPF L4 + userspace L7 fullproxy)

**Control plane:**
- **REST API server** — port 11111, base path `/netlox/v1`; all configuration is programmed here
- **Rule engine** — LB rules, endpoints, NAT policies, firewall
- **Health prober** — per-endpoint probes (tcp/udp/sctp/http/https/ping), configurable interval/retries
- **KV-cache selector** (inference fork) — consumes vLLM/SGLang KV-cache event streams over ZMQ to track which endpoint caches which prompt prefixes
- **P/D coordinator** (inference fork) — orchestrates prefill→decode two-phase request flow with NIXL KV-transfer coordination
- **HA manager** — cluster instance state (`/config/cistate`), BFD sessions (`/config/bfd`) for fast failover
- **Config snapshot** — persisted to `/etc/loxilb/snapshot.json`, restored on boot

**Data plane:**
- **eBPF (XDP + TC hooks)** — L4 fast path: connection tracking, NAT modes (DNAT/onearm/fullnat/DSR/hostonearm), L2/L3 forwarding. Source: github.com/loxilb-io/loxilb-ebpf
- **sockproxy / fullproxy** — a **userspace HTTP proxy**. When a rule uses `mode: 4`, the gateway terminates client TCP/TLS, parses the full HTTP request (model name, headers, body), selects an endpoint, and proxies to the backend. All AI features require this path because L4 eBPF decides from the 5-tuple before any HTTP body exists.

**Repository:** github.com/loxilb-io/loxilb (upstream), github.com/loxilb-io/loxilb-inference-gateway (AI fork)

### 2. kube-loxilb (Kubernetes Operator)

**Role:** Kubernetes service controller. Watches LoadBalancer services/endpoints/nodes, allocates external IPs (IPAM, shared or exclusive pools), and programs loxilb over the REST API. Supports service annotations (`loxilb.io/*`), BGP advertisement, and multi-homing.
**Repository:** github.com/loxilb-io/kube-loxilb

### 3. goBGP (Routing Stack)

Integrated BGP implementation (from github.com/osrg/gobgp) for VIP route advertisement, ECMP distribution, and integration with upstream routers. Configured via `/config/bgp/global`, `/config/bgp/neigh`, and BGP policy endpoints.

### 4. loxicmd (CLI)

kubectl-like CLI over the REST API, including AI-aware subcommands (`apikey`, `ratelimit`, `gpu`, `opa`, `sni`, KV inventory). **Repository:** github.com/loxilb-io/loxicmd

### 5. Monitoring Stack

Metrics collection is **off by default**; enable with `POST /netlox/v1/config/metrics`. Prometheus text metrics are then served from `GET /netlox/v1/metrics` on port **11111** (same listener as the REST API — secure accordingly). A deploy-as-code Prometheus + Grafana stack with provisioned dashboards and alert rules ships at `deploy/monitoring/` in github.com/loxilb-io/loxilb-inference-gateway.

---

## Deployment Topologies

### 1. External Mode

loxilb runs on dedicated node(s)/VM(s) outside the cluster (AWS-ELB-like model).

```bash
docker run -u root --cap-add SYS_ADMIN --restart unless-stopped --privileged \
  -dit -v /dev/log:/dev/log -v /opt/loxilb/config:/etc/loxilb \
  --name loxilb ghcr.io/loxilb-io/loxilb-inference-gateway:latest
```

Mount `/etc/loxilb` to a host path: the config snapshot survives container *restarts* without it, but is lost on container *recreation* (e.g. image upgrade).

Then deploy kube-loxilb with `--loxiURL=http://<lb-node-ip>:11111`.

**When to use:** public cloud (EKS/GKE/AKS), dedicated LB capacity, multi-cluster, LLM serving fleets fronted from outside the cluster.

### 2. In-Cluster Mode

loxilb runs as a DaemonSet/Deployment with `hostNetwork: true`; kube-loxilb auto-discovers loxilb pods. No external infrastructure. Good for on-prem, edge (K3s/K0s), dev/test.

### 3. HA Cluster Mode

2+ loxilb instances with master/backup election, BFD-based failure detection, and state sync; VIP fails over to the active master. Cluster state is visible at `GET /config/cistate/all` (instance, MASTER/BACKUP state, vip) and BFD sessions at `GET /config/bfd/all`. kube-loxilb `--setRoles` enables HA arbitration. Use for production availability targets and stateful protocols (SCTP, long-lived SSE streams — the inference fork also syncs P/D session and rate-limiter state between sockproxy instances).

---

## Data Flows

### L4 Packet Path (classic LB, eBPF)

```
Client → NIC → XDP hook (early parse/drops)
             → TC hook: conntrack lookup
                 ├─ existing session → apply cached NAT, forward
                 └─ new session → LB rule match (VIP:port:proto)
                                → endpoint selection (sel algorithm)
                                → NAT transform (per mode) → route/ARP → egress
Return traffic → reverse NAT via conntrack → client sees VIP
```

### L7/AI Request Path (fullproxy, `mode: 4`)

1. **Terminate and parse** — fullproxy accepts the connection (TLS per rule `security`), reads the HTTP request.
2. **Model pool selection** — requested model (`X-Model` header or body `model` field) matched against rules' `model_name`; `""` is the wildcard pool; no match → 503 `model_unavailable`.
3. **Endpoint selection** — the rule's `sel` algorithm (typically CHWBL `sel: 8`/`10` prefix affinity, or engine-exact KV routing when a KV event stream is wired).
4. **P/D orchestration (optional)** — with `pd_disagg_mode`, a prefill leg then a decode leg, coordinated via NIXL KV transfer.
5. **Stream relay** — with `sse_mode`, SSE is relayed with idle-timeout suppression, a wall-clock cap, and optional backend keepalive; tokens are counted from SSE chunks.

### Kubernetes Service Integration

```
kubectl apply (Service type=LoadBalancer)
  → kube-loxilb watch event
  → allocate external IP from pool, read annotations, resolve endpoints
  → POST /netlox/v1/config/loadbalancer to loxilb
  → loxilb validates, programs eBPF maps / proxy rules, starts probes,
    advertises route via BGP if configured
  → kube-loxilb sets .status.loadBalancer.ingress[0].ip
```

---

## Integration Contracts

### Clients ↔ loxilb (REST API)

**Endpoint:** `http://<loxilb-ip>:11111/netlox/v1/`

| Operation | Endpoint |
|-----------|----------|
| Create/update LB rule | POST `/config/loadbalancer` (upsert) |
| List LB rules | GET `/config/loadbalancer/all` |
| Delete LB rule | DELETE `/config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}` |
| Endpoint health | GET `/config/endpoint/all` |
| Conntrack | GET `/config/conntrack/all` |
| Cluster state | GET `/config/cistate/all` |
| Version / liveness | GET `/version` |

See `api-quick-reference.md` for the full catalog including AI-gateway endpoints (`/config/ai/*`, `/config/gpu/*`, `/config/trace/parsers`, `/config/opa/watcher`, `/sni/certificates`).

### Control Plane ↔ eBPF Data Plane

Config changes are validated by the rule engine, translated to eBPF map entries, and pushed via BPF syscalls; eBPF programs see updates on the next packet. Inspect live maps with `bpftool map dump`.

### Serving Engines ↔ KV-Cache Selector (inference fork)

vLLM/SGLang backends publish KV-cache events over ZMQ (`kvZmqPort`, default 5557). The selector maintains an inventory of which endpoint holds which prefix blocks so endpoint selection reflects live cache locality. Hash contract must match the engine (`kvBlockSize`, `kvHashAlgo`: sha256_cbor / xxhash_cbor).

---

## CNI / Platform Compatibility

Works with any Kubernetes distribution (k8s, k3s, k0s, kind, OpenShift) and any CNI (Calico, Flannel, Cilium, Weave, Multus), as long as routes exist between loxilb and pod IPs. Runs in any cloud or standalone. Multi-arch images: amd64, arm64.

---

## Performance Characteristics

The eBPF data path leads its class across architectures — see upstream benchmarks: single-node and multi-node performance pages at https://loxilb-io.github.io/loxilbdocs/ (perf-single, perf-multi) and ARM/Graviton results on loxilb.io.

**Optimization notes:**
- DSR mode (`mode: 3`) bypasses the LB on the return path — highest L4 throughput
- Established connections take the conntrack fast path (no rule re-evaluation)
- For KV-cache-aware / P/D deployments, host kernel 6.8 is recommended; kernels 6.12.53+, 6.14, and 6.17.5+ hit a BPF-verifier regression that breaks the eBPF data plane

---

## Security Model

**eBPF privileges:** requires privileged container (`--privileged --cap-add SYS_ADMIN`); Kubernetes `securityContext.privileged: true`.

**API security:**
- Optional JWT auth (`--userservice`: `/auth/login`, user CRUD) or OAuth2 (`--oauth2`)
- When auth is on, every endpoint — including `/netlox/v1/metrics` — requires `Authorization: Bearer`
- `--tls` adds an HTTPS listener on `:8091`; plain `:11111` stays open, so firewall or bind it to localhost in production
- OPA L4 admission policy via `/config/opa/watcher`; L7 mTLS per rule (`mtls_frontend` / `mtls_backend`)

**Kubernetes RBAC:** kube-loxilb needs watch access to services, endpoints, and nodes.

---

## Monitoring and Observability

- **Prometheus metrics:** `GET /netlox/v1/metrics` on :11111 after `POST /config/metrics` (503 until enabled); JSON series under `/netlox/v1/metrics/{flowcount,lbrulecount,...}`
- **Logs:** `GET /logs`; level set with `POST /config/params {"logLevel": "debug"}`
- **Tracing:** L7 deep inspection via `/config/trace/*` (incl. OTLP export), L4 sampling via `/config/l4trace/*`
- **Health:** `GET /version` for API liveness; endpoint probe states in `GET /config/endpoint/all`; HA via `/config/cistate/all` and `/config/bfd/all`

---

## Further Reading

- **Packet Processing:** `packet-processing.md`
- **Features (incl. AI):** `features.md`
- **API:** `api-quick-reference.md`
- **Kubernetes Integration:** `kubernetes-integration.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **HA Clustering:** `ha-clustering.md`

**External:**
- Upstream docs: https://loxilb-io.github.io/loxilbdocs/
- Inference gateway: github.com/loxilb-io/loxilb-inference-gateway (guide set under `docs/load-balancing/`)
- eBPF programs: github.com/loxilb-io/loxilb-ebpf
- Kubernetes operator: github.com/loxilb-io/kube-loxilb
