# LoxiLB Configuration Patterns

<!-- provenance: synced 2026-08-01 against loxilbdocs-inference-gateway docs/getting-started/installation.md, docs/getting-started/quickstart.md, docs/concepts/running-modes.md, docs/concepts/lb-algorithms.md, docs/ai-gateway/mcp-gateway.md, docs/operations/monitoring.md, loxilb-inference-gateway README.md, and loxitui swagger_new.yml -->

**Purpose:** Practical configuration patterns for deploying and operating LoxiLB (including the inference gateway) via Docker, REST, loxicmd, and Kubernetes.
**Target Audience:** Platform engineers, DevOps, SREs, LLM platform operators.

---

## Deployment Pattern: Docker (standalone / external LB node)

```bash
docker run -u root --cap-add SYS_ADMIN --restart unless-stopped --privileged \
  -dit -v /dev/log:/dev/log -v /opt/loxilb/config:/etc/loxilb \
  --name loxilb ghcr.io/loxilb-io/loxilb-inference-gateway:latest
```

Key points:
- `--privileged --cap-add SYS_ADMIN` and the `/dev/log` mount are required by the eBPF data plane; Linux hosts only (amd64/arm64).
- **Always mount `/etc/loxilb` to a host path.** The gateway persists its config snapshot to `/etc/loxilb/snapshot.json` and boot-restores it. Without the mount, config survives a container restart but is **lost when the container is recreated** (exactly what an image upgrade does).
- The REST API comes up on port **11111** (`/netlox/v1/...`). Verify: `curl -sf http://<host>:11111/netlox/v1/version`.
- Upstream (non-AI) image: `ghcr.io/loxilb-io/loxilb:latest` from github.com/loxilb-io/loxilb.

---

## Pattern 1: Classic L4 Load Balancer

```bash
# REST
curl -s -X POST http://<host>:11111/netlox/v1/config/loadbalancer \
  -H 'Content-Type: application/json' -d '{
  "serviceArguments": {
    "externalIP": "192.168.1.100", "port": 80, "protocol": "tcp",
    "sel": 0, "mode": 2,
    "monitor": true, "probetype": "http", "probeport": 8080,
    "probereq": "/healthz", "proberesp": "ok",
    "probeTimeout": 5, "probeRetries": 2 },
  "endpoints": [
    { "endpointIP": "10.0.1.5", "targetPort": 8080, "weight": 1 },
    { "endpointIP": "10.0.1.6", "targetPort": 8080, "weight": 1 } ]}'

# loxicmd equivalent
loxicmd create lb 192.168.1.100 --tcp=80:8080 --endpoints=10.0.1.5:1,10.0.1.6:1 --mode=fullnat
```

`mode: 2` (fullnat) works with any topology. Use `mode: 0` (DNAT, default) when backends must see the real client IP and return routing is symmetric; `mode: 3` (DSR) for maximum throughput (VIP on backend loopback + ARP suppression required).

---

## Pattern 2: Model-Name Routing (one VIP per model pool)

Each model pool is one L7 rule distinguished by `model_name`; the gateway reads the model from the `X-Model` header **or** the JSON body `model` field. Empty `model_name` (`""`) is the wildcard catch-all; no match returns 503 `model_unavailable`.

```bash
curl -s -X POST http://10.10.10.254:11111/netlox/v1/config/loadbalancer \
  -H 'Content-Type: application/json' -d '{
  "serviceArguments": {
    "externalIP": "10.10.10.254", "port": 2020, "protocol": "tcp",
    "sel": 0, "mode": 4,
    "host": "10.10.10.254",
    "path_prefix": "/", "path_match_mode": "prefix",
    "model_name": "llama-70b",
    "inactiveTimeOut": 30 },
  "endpoints": [ { "endpointIP": "31.31.31.1", "targetPort": 8080, "weight": 1 } ]}'
```

Conventions: `mode: 4` selects the L7 fullproxy (required for all AI features); `host` is the VIP address and must be local to the gateway node (the L7 proxy binds it).

---

## Pattern 3: KV-Cache-Aware vLLM Pool (CHWBL)

Identical vLLM replicas behind one OpenAI-compatible VIP with prefix-hash cache affinity:

```bash
curl -s -X POST http://10.10.10.254:11111/netlox/v1/config/loadbalancer \
  -H 'Content-Type: application/json' -d '{
  "serviceArguments": {
    "externalIP": "10.10.10.254", "port": 8080, "protocol": "tcp",
    "sel": 8, "mode": 4, "host": "10.10.10.254",
    "chwbl_prefix_hash_level": 2, "chwbl_replication": 100,
    "chwbl_mean_load_factor": 125,
    "sse_mode": true, "backend_keepalive_interval_sec": 60 },
  "endpoints": [
    { "endpointIP": "31.31.31.1", "targetPort": 8000, "weight": 1 },
    { "endpointIP": "32.32.32.1", "targetPort": 8000, "weight": 1 } ]}'

# loxicmd
loxicmd create lb 10.10.10.254 --tcp=8080:8000 --endpoints=31.31.31.1:1,32.32.32.1:1 \
  --select=chwbl --mode=fullproxy --host=10.10.10.254 --chwbl-hash-level=2 --chwbl-replication=100
```

Notes:
- Set `chwbl_mean_load_factor` explicitly — omitted, the effective runtime ceiling is 175, not the schema default 125.
- For **engine-exact** KV routing add `kvExactMode: 1`, `kvBlockSize` (= vLLM `block_size`), `kvHashAlgo` (= vLLM hash algo), `kvZmqPort` (default 5557); the engines publish KV-cache events over ZMQ.
- Use `sel: 10` (WRR-hash) instead of `8` for heterogeneous GPU tiers with weights.

---

## Pattern 4: P/D Disaggregation (prefill/decode pools)

```bash
curl -s -X POST http://10.10.10.254:11111/netlox/v1/config/loadbalancer \
  -H 'Content-Type: application/json' -d '{
  "serviceArguments": {
    "externalIP": "10.10.10.254", "port": 8080, "protocol": "tcp",
    "sel": 8, "mode": 4, "host": "10.10.10.254",
    "pd_disagg_mode": true, "pd_cache_aware_mode": true,
    "pd_session_ttl_sec": 600, "sse_mode": true },
  "endpoints": [
    { "endpointIP": "31.31.31.1", "targetPort": 8000, "weight": 1, "ep_role": 1, "nixl_port": 5601 },
    { "endpointIP": "32.32.32.1", "targetPort": 8000, "weight": 1, "ep_role": 2 } ]}'
```

`ep_role`: 1 = prefill, 2 = decode. Prefill/decode workers exchange KV cache over a NIXL side channel; each worker's NIXL port must match `nixl_port` (0 = use targetPort). Host-kernel note for GPU/KV deployments: prefer kernel 6.8; avoid 6.12.53+, 6.14, 6.17.5+.

---

## Pattern 5: MCP Gateway (session-sticky, TLS-terminating)

```bash
curl -s -X POST http://10.10.10.254:11111/netlox/v1/config/loadbalancer \
  -H 'Content-Type: application/json' -d '{
  "serviceArguments": {
    "externalIP": "10.10.10.254", "port": 2020, "protocol": "tcp",
    "sel": 3, "mode": 4, "security": 1,
    "session_header_name": "mcp-session-id",
    "host": "10.10.10.254", "trace_type": "mcp" },
  "endpoints": [
    { "endpointIP": "31.31.31.1", "targetPort": 8080, "weight": 1 },
    { "endpointIP": "32.32.32.1", "targetPort": 8080, "weight": 1 } ]}'
```

- `sel: 3` + `session_header_name: mcp-session-id` pins each MCP session to the backend that served its first request (required for stateful MCP sessions); `sel: 0` suffices for stateless probes.
- `security: 1` terminates HTTPS at the VIP with plain HTTP to backends; use `security: 2` for end-to-end HTTPS when the MCP servers speak TLS themselves.
- Stage certificates under the container cert dir (e.g. `/opt/loxilb/cert/`: `server.crt`, `server.key`, CA), with an IP SAN matching the VIP; manage via `/sni/certificates`.
- For HTTP/2 or gRPC MCP transports set `backend_protocol: "http2"` or `"both"` (ALPN applies on TLS backend legs).

---

## Pattern 6: Session Affinity by Header/Cookie/Query

```json
"serviceArguments": {
  "sel": 3, "mode": 4,
  "session_header_name": "X-Session-ID"   // or "cookie:JSESSIONID", "query:token", "basic-auth"
}
```

Empty `session_header_name` with `sel: 3` falls back to source-IP stickiness (clients behind shared NAT collapse onto one endpoint).

---

## Pattern 7: Monitoring Stack

```bash
# 1. Enable metrics collection (off by default; /metrics returns 503 until enabled)
curl -X POST http://127.0.0.1:11111/netlox/v1/config/metrics

# 2. Scrape Prometheus text from the REST listener
curl -s http://127.0.0.1:11111/netlox/v1/metrics | head
```

A ready-to-run Prometheus + Grafana stack (provisioned dashboards + alert rules) ships at `deploy/monitoring/` in github.com/loxilb-io/loxilb-inference-gateway. The shipped `prometheus.yml` scrapes `127.0.0.1:11111` with `metrics_path: /netlox/v1/metrics` every 10 s. If API auth is enabled (`--userservice`/`--oauth2`), the scrape job must send `Authorization: Bearer <token>`; with `--tls`, an HTTPS listener is added on `:8091` (plain `:11111` stays open — firewall it).

---

## Pattern 8: BGP and HA

```bash
# BGP neighbor
curl -s -X POST http://<host>:11111/netlox/v1/config/bgp/neigh \
  -H 'Content-Type: application/json' \
  -d '{ "ipAddress": "10.0.0.1", "remoteAs": 65100, "remotePort": 179 }'

# Advertise a service via BGP: set "bgp": true on the LB rule

# Inspect HA state
curl -s http://<host>:11111/netlox/v1/config/cistate/all   # instance, MASTER/BACKUP, vip
curl -s http://<host>:11111/netlox/v1/config/bfd/all       # BFD failover sessions
```

For HA pairs, kube-loxilb takes comma-separated `--loxiURL=http://<lb1>:11111,http://<lb2>:11111` and `--setRoles` for role arbitration.

---

## Kubernetes Pattern: kube-loxilb

Kubernetes service-type-LoadBalancer integration is handled by **kube-loxilb** (github.com/loxilb-io/kube-loxilb): it watches services, allocates external IPs from configured CIDR pools, and programs loxilb over the REST API. Services are tuned with `loxilb.io/*` annotations (LB mode, algorithm, liveness probes, IPAM pool selection, static/shared IPs, multi-homing). See `kubernetes-integration.md` in this knowledge base and the upstream documentation (https://loxilb-io.github.io/loxilbdocs/) for the annotation and flag reference; classic L4 behavior is inherited unchanged by the inference gateway.

---

## Troubleshooting Configuration

### Rule created but no traffic
```bash
# Check endpoint probe state
curl -s http://<host>:11111/netlox/v1/config/endpoint/all
# Look for "currState" != ok — then fix probetype/probeport/probereq/proberesp on the rule
```

### AI features not taking effect
- Confirm the rule has `mode: 4` — every AI/L7 field is inert on L4 modes.
- `chwbl_*` fields are honored only when `sel` is 8 or 10.
- All requests landing on one pool / wildcard → check `model_name` per rule and that clients send `"model"` in the body or `X-Model`.
- 503 `model_unavailable` → no rule matched and no `model_name: ""` wildcard exists.

### Config lost after upgrade
- The container was recreated without the `/etc/loxilb` host mount. Re-add `-v /opt/loxilb/config:/etc/loxilb`; the snapshot (`snapshot.json`) then survives recreation.

### Service stuck in `<pending>` (Kubernetes)
```bash
kubectl logs -n kube-system deploy/kube-loxilb
# Typical causes: loxiURL unreachable, IP pool exhausted, annotation syntax error
```

---

## Best Practices

1. **Persist the snapshot** — always bind-mount `/etc/loxilb`.
2. **Health checks in production** — set `monitor: true` with application-specific probes.
3. **Set CHWBL knobs explicitly** — especially `chwbl_mean_load_factor`.
4. **Secure the API** — enable auth for any non-localhost exposure; remember `/netlox/v1/metrics` shares the API listener.
5. **DSR** — test failover; backend loopback/ARP prep is mandatory.
6. **Session affinity** — prefer explicit `session_header_name` keys over source-IP stickiness.

---

## Further Reading

- **Architecture:** `architecture.md`
- **Features Catalog:** `features.md`
- **API Reference:** `api-quick-reference.md`
- **Kubernetes Integration:** `kubernetes-integration.md`
- **Troubleshooting:** `troubleshooting.md`
- **Monitoring:** `monitoring.md`
