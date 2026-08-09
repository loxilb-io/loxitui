# LoxiLB Troubleshooting Guide

<!-- provenance: synced 2026-08-01 against LoxiLB inference-gateway docs (docs/operations/troubleshooting.md, docs/operations/monitoring.md, docs/reference/system-requirements.md, docs/use-cases/configuration-tuning.md), loxilb-io/loxilb-inference-gateway (README.md, options/options.go, api/swagger.yml, loxilb-ebpf map constants), kube-loxilb source (github.com/loxilb-io/kube-loxilb) -->

**Purpose:** Systematic troubleshooting for common LoxiLB issues in Kubernetes, standalone, and inference-gateway deployments.
**Target Audience:** DevOps engineers, SREs, platform support teams

---

## Quick Diagnostic Checklist

```bash
# 1. LoxiLB pod/container status
kubectl get pods -n kube-system -l app=loxilb   # Kubernetes
docker ps | grep loxilb                          # Standalone

# 2. kube-loxilb operator (Kubernetes only)
kubectl logs -n kube-system deploy/kube-loxilb --tail=50

# 3. LoxiLB API up? (version endpoint)
curl -s http://<loxilb-ip>:11111/netlox/v1/version

# 4. Rules present?
curl -s http://<loxilb-ip>:11111/netlox/v1/config/loadbalancer/all | jq .

# 5. Services
kubectl get svc -A | grep LoadBalancer
```

If an API auth mode is enabled (`--userservice` / `--oauth2` / manual token), add `-H "Authorization: Bearer $TOKEN"` to every API call.

---

## LoxiLB Pod/Container Not Running

### 1. eBPF Program Load Failure / Kernel Issues

The eBPF data plane needs a modern Linux kernel. **Known-broken ranges:** kernels **6.12.53+, 6.14, and 6.17.5+** hit a BPF-verifier regression that breaks the data plane — use kernel **6.8** for GPU / KV-cache-aware / P/D deployments.

```bash
uname -r
docker logs loxilb 2>&1 | grep -i "ebpf\|bpf"
```

### 2. Insufficient Privileges

```yaml
spec:
  hostNetwork: true            # REQUIRED for eBPF on node interfaces
  containers:
  - name: loxilb
    securityContext:
      privileged: true         # REQUIRED
      capabilities:
        add: ["SYS_ADMIN", "NET_ADMIN"]
```

Standalone: `docker run -u root --cap-add SYS_ADMIN --privileged ...`.

### 3. Resource Limits Too Low

`failed to create eBPF map: cannot allocate memory` → raise memory limits (1–2 Gi recommended).

### 4. Configuration Lost After Upgrade

The gateway persists its snapshot at `/etc/loxilb/snapshot.json` and boot-restores it. Without a host mount (`-v /opt/loxilb/config:/etc/loxilb`), config survives a *restart* but is **lost when the container is recreated** (e.g. image upgrade). Always bind-mount `/etc/loxilb`.

---

## External IP Pending in Kubernetes

```bash
kubectl get svc myapp
# myapp   LoadBalancer   <pending>     80:32541/TCP
```

| Cause | Check | Fix |
|-------|-------|-----|
| kube-loxilb cannot reach LoxiLB | `kubectl logs -n kube-system deploy/kube-loxilb`; `curl http://<loxilb-ip>:11111/netlox/v1/version` from the pod | Correct `--loxiURL`, fix network path/firewall |
| IP pool exhausted | logs mention pool exhaustion; count allocated IPs across LB services | Expand `--cidrPools` range or add a pool |
| Missing/mismatched loadBalancerClass | service spec | Set `loadBalancerClass: loxilb.io/loxilb` if kube-loxilb runs with a class filter |
| Node excluded from LB | `kubectl get nodes -o yaml \| grep exclude-from-external-load-balancers` | Remove the label |
| kube-loxilb not running | `kubectl get pods -n kube-system -l app=kube-loxilb-app` | Deploy from https://github.com/loxilb-io/kube-loxilb/tree/main/manifest |

---

## Traffic Not Reaching Backend Pods

External IP allocated, but `curl http://<external-ip>` times out or resets.

### 1. All Endpoints Marked Inactive

```bash
loxicmd get lb -o wide          # endpoint STATE column
curl -s http://<loxilb-ip>:11111/netlox/v1/config/endpoint/all | jq .
```

Fix the health-check config (probe path/port/response), verify the backend responds directly:

```yaml
metadata:
  annotations:
    loxilb.io/liveness: "yes"
    loxilb.io/probetype: "http"
    loxilb.io/probereq: "/healthz"
    loxilb.io/proberesp: "OK"
    loxilb.io/probetimeout: "10"
    loxilb.io/proberetries: "3"
```

Note: kube-loxilb `--monitor` alone leaves probe type `none` — endpoints never change state without a real probe configured.

### 2. Firewall Blocking Traffic

```bash
loxicmd get firewall
# Add an accept rule via POST /netlox/v1/config/firewall if needed
```

### 3. Return-Path Routing (default/onearm modes)

Return traffic must route back through LoxiLB. Either use `loxilb.io/lbmode: "fullnat"` (recommended for K8s) or make LoxiLB the backend's default gateway.

### 4. Conntrack Table Full

Default capacity is **512K entries** (eBPF map `LLB_CT_MAP_ENTRIES`, 256K × 2).

```bash
loxicmd get conntrack | wc -l
# Or in Prometheus: loxilb_active_conntrack_entries / loxilb_conntrack_max_entries
```

Fix: lower the per-rule idle timeout (`loxilb.io/timeout` annotation / `inactiveTimeOut` field / `--inatimeout` in loxicmd), or scale horizontally. There is no global `--conn-timeout` daemon flag.

### 5. eBPF Map Errors

`map update failed: no space left on device` → a map hit capacity (LB rules default 4,096; endpoints/rule 32). Reduce rule count or rebuild with larger maps (https://github.com/loxilb-io/loxilb-ebpf).

---

## AI Gateway Issues (Inference Gateway)

**The recurring failure theme is silent degradation** — a misconfigured AI feature does not error; requests are simply served by the fallback tier (round-robin). Never trust that a feature engaged just because requests succeed — always verify from metrics.

### AI routing not happening at all

| Symptom | Cause | Fix |
|---------|-------|-----|
| Body never inspected; `X-Model`/`model` ignored | Rule `mode` is not `4`. **FullProxy (`mode: 4`) is the prerequisite for every AI feature** | Recreate the rule with `"mode": 4` |
| `mode: 4` set but a feature does nothing | Feature not opted in on the rule: model routing needs `model_name`; KV routing needs `kvExactMode > 0`; P/D needs `pd_disagg_mode: true` | Add the field(s), recreate the rule |

```bash
curl -s http://<vip>:11111/netlox/v1/config/loadbalancer/all -H "Authorization: Bearer $TOKEN" \
  | jq '.lbAttr[].serviceArguments | {port, mode, model_name, kvExactMode, pd_disagg_mode}'
```

### Model routing returns 503 (`model_unavailable`)

Resolution order: (1) `X-Model` header → (2) JSON body `model` → (3) wildcard pool. The wildcard is `model_name: ""` (**empty string**, not `"*"`). Matching is exact and case-sensitive; a stale `X-Model` header wins over the body.

### KV-cache routing silently not firing (the #1 issue)

The parity contract is all-or-nothing — if any leg breaks, hit rate drops to zero and routing silently falls back to round-robin:

| Broken leg | Fix |
|------------|-----|
| Block/page size mismatch | `kvBlockSize` must equal vLLM `--block-size` (16; CPU vLLM defaults to 128 — override) or SGLang effective page size |
| Non-portable hash algo | vLLM: `--prefix-caching-hash-algo sha256_cbor` (or `xxhash_cbor`), rule `kvHashAlgo` to match. **SGLang: OMIT `kvHashAlgo`** |
| Hash seed | `PYTHONHASHSEED=0` in every engine container **and** `LLB_KV_NONE_HASH_SEED=0` on LoxiLB |
| Wrong ZMQ port | `kvZmqPort` must match the engine's `--kv-events-config` publisher port (default 5557) |
| Missing tokenizer | Populate `/etc/loxilb/tokenizers/<model-id>` (`/` → `__`), restart LoxiLB |

`kvEngineType` (`vllm`/`sglang`) is **immutable after rule creation** — delete and recreate to switch engines.

**Verify it fired:**

```bash
M() { curl -s http://<vip>:11111/netlox/v1/metrics -H "Authorization: Bearer $TOKEN"; }
M | grep '^loxilb_pd_kv_blocks_total'        # inventory ingested, must be > 0
M | grep '^loxilb_pd_kv_tier15_hits_total'   # MUST ADVANCE after one warm repeat request
ss -tln | grep :5557                          # engine's ZMQ publisher listening (each prefill host)
```

### P/D handoff fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| Decode logs `num_external_tokens == 0`; empty/garbage output | NIXL GPU block-count mismatch | Pin decode with `--num-gpu-blocks-override <min prefill num_gpu_blocks>`; read live values from `vllm:cache_config_info` |
| Handoff never connects across hosts | Side-channel host is `0.0.0.0` | Set `VLLM_NIXL_SIDE_CHANNEL_HOST` to a routable IP on every engine |
| Mesh partially wedged after redeploy | Partial vLLM restart left stale NIXL state | Redeploy the **whole** mesh: teardown → decode up → prefills up → verify |
| `504 pd_prefill_timeout` on long contexts | Default 30 s prefill timeout | Raise `LLB_PD_PREFILL_TIMEOUT_SEC` (e.g. 180 for ~32k contexts) |

### SSE stream cut off

| Symptom | Cause | Fix |
|---------|-------|-----|
| Idle/slow stream severed | `sse_mode` not set, so `inactiveTimeOut` applies | Set `"sse_mode": true` on the rule |
| Cut at a fixed wall-clock point | `max_stream_duration_sec` cap (default `0` = 24 h ceiling) | Raise it, or leave `0` |
| Dies on cloud/NAT paths in quiet gaps | NAT idle-evicted the backend flow | Set `backend_keepalive_interval_sec: 60` |

### API keys / rate limits "not enforced"

**Expected today, not a bug:** API-key auth (401/403) and per-tenant rate limiting (429) are control-plane CRUD only — the gateway stores keys/limits but does not yet reject requests in the data path. SSE lifecycle and token accounting are wired. Enforce at an edge in front of the gateway until data-path enforcement ships.

### Metrics endpoint 401 / empty

- `401` → API auth is enabled; send `Authorization: Bearer <token>` (also in the Prometheus scrape job).
- Empty → metrics collection not enabled: `curl -X POST http://<host>:11111/netlox/v1/config/metrics` (or `loxicmd set metrics --enable`).
- Missing expected series → lazy registration; fire one warm-up request, re-scrape.

---

## SCTP-Specific Issues

### SCTP Packets Dropping Silently

Host kernel SCTP checksum validation can conflict with eBPF NAT (same-node workloads, CNI veth/bridge paths):

```bash
# Disable kernel SCTP checksum validation on LoxiLB nodes
echo 1 > /sys/module/sctp/parameters/no_checksums
echo 0 > /proc/sys/net/netfilter/nf_conntrack_checksum
```

Alternatively install the LoxiLB checksum kprobe helper from the public repo: https://github.com/loxilb-io/loxilb-ebpf (kprobe/install.sh).

### SCTP ABORT After INIT-ACK (VM/hypervisor deployments)

Cause: hypervisor NIC driver lacks eBPF metadata support, packets take a kernel fallback path. Use bridge-mode emulated interfaces with virtio drivers (not e1000/macvtap-passthrough). Check with `ethtool -i eth0 | grep driver`.

### SCTP ABORT After a Few Seconds (multi-homing heartbeats)

The application advertises all host IPs in INIT while LoxiLB knows only one. Either bind the app to a single IP, or use proper SCTP multi-homing (`loxilb.io/secondaryIPs` / `loxilb.io/poolSelectSecondary` with `loxilb.io/lbmode: "fullnat"` — see `kubernetes-integration.md`).

---

## BGP Issues

### Peer Not Establishing

```bash
loxicmd get bgpneigh          # state should be 'established'
ping <peer>; nc -vz <peer> 179
```

Checks: TCP/179 reachable (firewall), ASN matches the peer's expectation, MD5 password if the peer requires it:

```bash
curl -X POST http://<loxilb-ip>:11111/netlox/v1/config/bgp/neigh \
  -H 'Content-Type: application/json' \
  -d '{"ipAddress":"10.0.0.1","remoteAs":65100,"password":"secret123"}'
```

### Routes Not Advertised

Verify BGP is enabled (`--bgp` on loxilb, or kube-loxilb `--setBGP=<AS> --extBGPPeers=<ip>:<as>`), and that the service VIP was actually allocated. On the router: `show ip bgp neighbors <loxilb-ip> advertised-routes`.

---

## Diagnostic Commands

### LoxiLB Internal State (loxicmd)

```bash
loxicmd get lb                # LB rules
loxicmd get lb -o wide        # with endpoints and state
loxicmd get endpoint          # endpoint probe states
loxicmd get conntrack         # connection tracking
loxicmd get port              # device ports
loxicmd get route             # routes
loxicmd get firewall          # firewall rules
loxicmd get bgpneigh          # BGP neighbors
loxicmd get metrics           # metrics collection setting
```

### REST API Queries

```bash
BASE=http://<loxilb-ip>:11111/netlox/v1
curl -s $BASE/version
curl -s $BASE/config/loadbalancer/all | jq .
curl -s $BASE/config/conntrack/all | jq .
curl -s $BASE/config/endpoint/all | jq .
curl -s $BASE/config/cistate/all | jq .            # HA state
curl -s $BASE/metrics                               # Prometheus metrics (must be enabled)
curl -s $BASE/config/ai/kv/inventory                # KV block inventory (inference gateway)
```

### Logs

```bash
docker logs loxilb -f                        # or kubectl logs -n kube-system <pod> -f
tail -f /var/log/loxilb/*.log                # structured logs (--log-dir, JSON/text per --log-format)
docker logs loxilb 2>&1 | grep -i error
```

Log level is adjustable at runtime: `--loglevel` at start, or the config-params API (`trace|debug|info|warning|error|...`).

### Packet Capture

```bash
docker exec -it loxilb tcpdump -i eth0 -w /tmp/capture.pcap host <vip>
docker exec -it loxilb tcpdump -i eth0 sctp -v
```

---

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `eBPF map update failed` / `no space left on device` | Map at capacity (conntrack 512K, LB rules 4K default) or permission denied | Lower idle timeouts, scale out, verify privileged mode |
| `Failed to load eBPF program` | Kernel incompatibility (see broken ranges above) | Use kernel 6.8; avoid 6.12.53+/6.14/6.17.5+ |
| endpoint `inactive` | Health probe failing | Fix probe config; test backend directly |
| IP pool exhausted | No free IPs | Expand `--cidrPools` |
| `401 Invalid authentication credentials` | API auth mode enabled | Send `Authorization: Bearer <token>` |
| `503 model_unavailable` | No matching `model_name` rule, no wildcard | Add matching rule or wildcard `model_name: ""` |
| `504 pd_prefill_timeout` | Prefill exceeded timeout | Raise `LLB_PD_PREFILL_TIMEOUT_SEC` |
| SCTP ABORT | Various — see SCTP section | Checksum / driver / multi-homing fixes above |

---

## Escalation Checklist

Collect before filing an issue:

```bash
# Environment
kubectl version; kubectl get nodes -o wide; uname -a

# LoxiLB state
docker logs loxilb > loxilb.log
kubectl logs -n kube-system deploy/kube-loxilb > kube-loxilb.log
loxicmd get lb -o wide; loxicmd get endpoint; loxicmd get port
curl -s http://<loxilb-ip>:11111/netlox/v1/version

# Config snapshot
kubectl get svc/<service-name> -o yaml
cat /opt/loxilb/config/snapshot.json   # if bind-mounted

# Packet capture around the failure
docker exec -it loxilb tcpdump -i eth0 -w /tmp/debug.pcap -c 1000
```

**Report to:** https://github.com/loxilb-io/loxilb/issues (upstream) or https://github.com/loxilb-io/loxilb-inference-gateway/issues (inference gateway)

---

## Further Reading

- **Architecture:** `architecture.md`
- **Packet Processing:** `packet-processing.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **Monitoring:** `monitoring.md`
- **Performance Tuning:** `performance.md`
- **HA Clustering:** `ha-clustering.md`
