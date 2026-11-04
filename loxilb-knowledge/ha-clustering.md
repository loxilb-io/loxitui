# LoxiLB High Availability & Clustering Guide

<!-- provenance: synced 2026-08-01 against loxilb-io/loxilb-inference-gateway (options/options.go, cicd/cluster1|cluster2|cluster-intKA HA scenarios, api/swagger.yml cistate endpoints, deploy/monitoring/prometheus/rules/loxilb-alerts.yml), kube-loxilb source/manifests (github.com/loxilb-io/kube-loxilb), and LoxiLB inference-gateway docs (docs/concepts/architecture.md, docs/ai-gateway/kv-caching.md) -->

**Purpose:** High availability deployment patterns, failover mechanisms, and multi-instance clustering for production resilience.
**Target Audience:** Solution architects, SREs, infrastructure engineers

HA behavior is inherited unchanged from upstream loxilb — the inference gateway is the same binary with per-rule AI features, so all upstream HA deployment modes apply. Upstream reference: https://docs.loxilb.io/

---

## HA Architecture Overview

LoxiLB supports multiple HA deployment patterns:

1. **Active-Backup** — master/backup pair with VIP failover (built-in keepalive/BFD, or external keepalived)
2. **Active-Active (BGP ECMP)** — multi-path routing with load distribution via GoBGP
3. **Kubernetes-arbitrated roles** — kube-loxilb `--setRoles` elects MASTER/BACKUP among instances
4. **Kubernetes DaemonSet / in-cluster** — per-node LoxiLB instances

---

## Active-Backup HA (built-in cluster mode)

### Instance Flags (verified against `options/options.go`)

| Flag | Description |
|------|-------------|
| `--cluster=<IP[,IP...]>` | Comma-separated peer cluster-node IP addresses |
| `--self=<n>` | This instance's identity within the cluster (e.g. `0`, `1`) |
| `--ka=<RemoteIP>:<SourceIP>[:<Interval>]` | KeepAlive/BFD peer definition |
| `--clusterinterface=<if>` | Cluster interface for egress HA |
| `--rpc=<netrpc\|grpc>` | RPC transport used for state syncing between instances (default `netrpc`) |

### Deployment (Docker pair)

```bash
# Instance 1 (self=0)
docker run -d --name loxilb1 --privileged --cap-add SYS_ADMIN --network host \
  ghcr.io/loxilb-io/loxilb:latest \
    --cluster=10.0.0.11 --self=0 --ka=10.0.0.11:10.0.0.10

# Instance 2 (self=1)
docker run -d --name loxilb2 --privileged --cap-add SYS_ADMIN --network host \
  ghcr.io/loxilb-io/loxilb:latest \
    --cluster=10.0.0.10 --self=1 --ka=10.0.0.10:10.0.0.11
```

For the inference gateway, use the `ghcr.io/loxilb-io/loxilb-inference-gateway:latest` image — same flags.

An alternative validated pattern (used by upstream CI HA scenarios) runs an **external keepalived** for VRRP-based VIP failover alongside LoxiLB with GoBGP configs on each node.

### Checking HA State

HA (CI — cluster instance) state is exposed via the REST API:

```bash
# Get HA state of all cluster instances
curl -s http://<loxilb-ip>:11111/netlox/v1/config/cistate/all | jq .

# Set instance state (used by external arbiters such as kube-loxilb)
curl -X POST http://<loxilb-ip>:11111/netlox/v1/config/cistate \
  -H 'Content-Type: application/json' \
  -d '{"instance":"default","state":"MASTER","vip":"192.168.1.254"}'
```

States: `MASTER` (active, owns VIP), `BACKUP` (standby), `FAULT` (down/isolated).

---

## Kubernetes: kube-loxilb Role Arbitration

kube-loxilb can arbitrate active/backup roles across LoxiLB instances so no external VRRP is needed:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kube-loxilb
  namespace: kube-system
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: kube-loxilb
        image: ghcr.io/loxilb-io/kube-loxilb:latest
        args:
        - --loxiURL=http://10.0.0.10:11111,http://10.0.0.11:11111  # all instances
        - --cidrPools=defaultPool=192.168.1.100-192.168.1.110
        - --setRoles=0.0.0.0          # kube-loxilb elects MASTER/BACKUP and programs cistate
```

**Behavior:**
- kube-loxilb configures **all** instances listed in `--loxiURL` with identical LB rules
- With `--setRoles`, kube-loxilb monitors instance health and re-elects the MASTER on failure
- Related flags: `--zone=<name>` and `--numZoneInstances=<n>` (HA instances per zone), `--excludeRoleList` (nodes excluded from role selection)

---

## Active-Active HA (BGP ECMP)

### Architecture

```
              BGP Router (ECMP)
                    ↓
       ┌────────────┼────────────┐
  LoxiLB-1                   LoxiLB-2
  advertises VIP/32          advertises VIP/32
       └────────────┬────────────┘
                    ↓
              Backend Servers
```

- Both instances active; traffic split by router ECMP (5-tuple hash)
- Automatic failover via BGP route withdrawal
- Horizontal scaling: add more instances advertising the same VIPs

### Configuration

LoxiLB embeds GoBGP. `--bgp` (or `-b`) enables the BGP thread; neighbors are configured via the API/loxicmd or a GoBGP config file:

```bash
docker run -d --name loxilb-1 --privileged --network host \
  ghcr.io/loxilb-io/loxilb:latest --bgp

# Add a BGP neighbor via API
curl -X POST http://10.0.0.10:11111/netlox/v1/config/bgp/neigh \
  -H 'Content-Type: application/json' \
  -d '{"ipAddress":"10.0.0.1","remoteAs":65100}'
```

`--peer` (`-r`) runs LoxiLB in GoBGP-only mode (no datapath) — useful as a route reflector/peer node.

### kube-loxilb BGP flags

```yaml
args:
- --loxiURL=http://10.0.0.10:11111,http://10.0.0.11:11111
- --cidrPools=defaultPool=192.168.1.100-192.168.1.110
- --setBGP=65000                               # local AS
- --extBGPPeers=10.0.0.1:65100                 # upstream router(s)
# optional: --listenBGPPort=<port>, --eBGPMultiHop, --enableBGPCRDs
```

When a service is created, each LoxiLB instance advertises the allocated VIP as a /32; the router installs equal-cost paths to all live instances.

### Failover Behavior

- Instance failure → BGP session drops → router withdraws that path → traffic shifts to remaining instances
- Convergence is governed by BGP hold timers; use BFD (`--ka` supports BFD-style keepalives) for faster detection

---

## Kubernetes DaemonSet HA

One LoxiLB per node (in-cluster mode), traffic kept node-local:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: loxilb-lb
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: loxilb-lb
  template:
    metadata:
      labels:
        app: loxilb-lb
    spec:
      hostNetwork: true
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule
      containers:
      - name: loxilb
        image: ghcr.io/loxilb-io/loxilb:latest
        securityContext:
          privileged: true
          capabilities:
            add: ["SYS_ADMIN", "NET_ADMIN"]
```

With kube-loxilb `--setUniqueIP=true`, each service gets a dedicated external IP; instances can also share IPs (default). Reference manifests: https://github.com/loxilb-io/kube-loxilb/tree/main/manifest

---

## State Replication

### 1. Configuration Replication (kube-loxilb)

API-driven: kube-loxilb POSTs the same LB rule to every instance in `--loxiURL`, guaranteeing identical rule sets. For standalone deployments, replicate configuration via IaC or by restoring the same `/etc/loxilb/snapshot.json`.

### 2. Runtime State Sync

Cluster instances sync state over the RPC channel selected by `--rpc` (netrpc or grpc). The L7/sockproxy sync path exports health metrics:

- `loxilb_sockproxy_sync_apply_errors_total` — peer state application failures (alert: `LoxilbHaSyncFailing`, critical)
- `loxilb_sockproxy_sync_conflict_total`, `_drop_total`, `_overflow_total`, `_push_latency_seconds_bucket`

Design applications for connection resets on failover regardless: use client retry logic, idempotent APIs, and server-side session stores (Redis/JWT) rather than relying on LB-level session state surviving a failover.

### 3. AI Gateway HA Consistency (inference gateway)

For KV-cache-aware routing, **all LoxiLB instances in an HA pair must use identical KV parity settings** — `kvHashAlgo`, `kvBlockSize`, and the hash seed (`LLB_KV_NONE_HASH_SEED`, matching the engines' `PYTHONHASHSEED`). A mismatched instance silently degrades to round-robin after failover. Also keep tokenizer directories (`/etc/loxilb/tokenizers/`) and `LLB_PD_*` admission settings identical across instances.

---

## Multi-Region HA

For geo-redundancy, deploy independent LoxiLB clusters per region and steer clients with GeoDNS (Route53, Cloudflare, etc.) using HTTP health checks against each region's VIP. Failover granularity is DNS TTL-based (typically 30–60 s). Keep per-region configuration identical via IaC.

---

## Monitoring HA Health

```promql
# Instance up/down
up{job="loxilb"}

# All instances down
count(up{job="loxilb"} == 1) < 1

# HA sync failing (peer state not applying)
rate(loxilb_sockproxy_sync_apply_errors_total[5m]) > 0
```

Shipped alerts (see `monitoring.md`): `LoxilbScrapeDown` (critical, 1m), `LoxilbHaSyncFailing` (critical, 5m). Note `up == 0` also fires when metrics collection is disabled (endpoint returns 503) — check `POST /netlox/v1/config/metrics` before assuming instance failure.

---

## Best Practices

1. **Use BGP ECMP for large-scale deployments** — linear scale-out, automatic failover, no VIP contention.
2. **Deploy across failure domains** — separate racks/AZs; independent clusters per region.
3. **Test failover regularly** — stop the master instance, verify VIP/route movement, confirm alerts fire.
4. **Monitor sync health** — alert on `loxilb_sockproxy_sync_apply_errors_total` and instance down > 1 minute.
5. **Maintain configuration parity** — IaC-managed configs; identical rules, KV parity settings, and env across instances; persist `/etc/loxilb` on every node.

---

## Further Reading

- **Architecture:** `architecture.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **Monitoring:** `monitoring.md`
- **Performance Tuning:** `performance.md`
- **Troubleshooting:** `troubleshooting.md`
- **kube-loxilb:** https://github.com/loxilb-io/kube-loxilb
