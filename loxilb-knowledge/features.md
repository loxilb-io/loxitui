# LoxiLB Features Catalog

<!-- provenance: synced 2026-08-01 against loxitui swagger_new.yml (LoadbalanceEntry schema), loxilbdocs-inference-gateway docs/concepts/lb-algorithms.md, docs/concepts/running-modes.md, docs/ai-gateway/overview.md, docs/ai-gateway/mcp-gateway.md, and loxilb-inference-gateway README.md -->

**Purpose:** Catalog of LoxiLB load balancing modes, selection algorithms, protocols, and AI-gateway features, keyed to the REST API fields.
**Target Audience:** Network engineers, DevOps, LLM platform engineers.

---

## Load Balancing Modes (`mode` field, integer)

| `mode` | Name | Data path | Notes |
|--------|------|-----------|-------|
| `0` | DNAT (default) | L4 eBPF | Destination NAT only; client IP preserved; needs symmetric return routing |
| `1` | onearm | L4 eBPF | SNAT to the LB interface IP; single-arm topologies |
| `2` | fullnat | L4 eBPF | DNAT + SNAT to VIP; works with any topology; backend sees VIP as client (use `proxyprotocolv2` to preserve client info) |
| `3` | dsr | L4 eBPF | Direct Server Return — DNAT on request path only; response bypasses the LB; backend must hold the VIP on loopback and suppress ARP |
| `4` | **fullproxy** | **L7 userspace proxy** | Terminates TCP/TLS/HTTP; **required for every AI feature** |
| `5` | hostonearm | L4 eBPF | Host one-arm variant |
| `6` | aigw | — | Present in the schema but not the exercised path; use `mode: 4` for AI routing |

### DSR backend prep
```bash
ip addr add <VIP>/32 dev lo
echo 1 > /proc/sys/net/ipv4/conf/lo/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/lo/arp_announce
```

---

## Selection Algorithms (`sel` field, integer)

| `sel` | Algorithm | Summary |
|-------|-----------|---------|
| `0` | Round-robin (rr, default) | Even rotation. No cache/session awareness |
| `1` | Hash | Static tuple hash (L4 session affinity) |
| `2` | Priority / weighted round-robin (wrr) | Rotation biased by endpoint `weight` |
| `3` | Persist | Session affinity; key from `session_header_name` (header/cookie/query/basic-auth) or source IP fallback |
| `4` | Least connections (lc) | Fewest active connections wins |
| `5` | n2 | Telco (5G N2) variant |
| `6` | n3 | Telco (5G N3) variant |
| `7` | quiccid | QUIC connection-ID based selection |
| `8` | CHWBL | Consistent hash with bounded load — prompt/prefix-aware cache locality for LLM pools |
| `9` | GPU-aware | Least-loaded GPU via live worker metrics (queue depth, KV-cache pressure); advanced, validate before production |
| `10` | WRR-hash | Weighted CHWBL — prefix-cache locality plus weight-driven split for heterogeneous GPUs |

AI-aware behaviors (`3` with headers, `8`, `9`, `10`) require `mode: 4` (fullproxy); in L4 modes they degrade to L4-only behavior.

### Choosing for LLM serving
- **`sel: 8` CHWBL** — general default for conversational/RAG workloads: strong cache locality without client cooperation; bounded-load ceiling prevents hot-prefix herding.
- **`sel: 3` persist** — workloads with an explicit session ID (chat thread header, `mcp-session-id`, cookie).
- **`sel: 9` GPU-aware** — throughput-oriented independent requests; requires the worker metrics feed (`POST /config/worker/metrics`, `POST /config/gpu/enable`).
- **`sel: 10` WRR-hash** — cache-aware routing over unequal backends (mixed GPU tiers).
- **`sel: 0`/`2`** — stateless single-shot pools (batch classification, embeddings).

### CHWBL tuning fields (apply to `sel: 8` and `10` only)

| Field | Default | Range | Purpose |
|-------|---------|-------|---------|
| `chwbl_prefix_hash_level` | 1 | 1–3 | Prefix depth in hash: 1 = system prompt + model, 2 = + session context, 3 = + RAG context |
| `chwbl_prefix_hash_flags` | 0 (auto) | 0–255 bitflags | Extra fields in hash: bit0 LoRA, bit1 image, bit2 audio, bit3 cache_salt, bit4 tools, bit5 session, bit6 RAG template, bit7 RAG docs |
| `chwbl_mean_load_factor` | 125 (schema) | 100–300 | Bounded-load ceiling %: `max_load = avg × factor/100`. Caution: if omitted, the runtime default is effectively **175** — set explicitly if the ceiling matters |
| `chwbl_replication` | 100 | 1–1024 | Virtual nodes per endpoint (for `sel: 10`: total vnodes, split by weight) |
| `chwbl_enable_cache_salt` | false | — | Require `cache_salt` per request for strict multi-tenant cache isolation |

### Session affinity (`sel: 3`) — `session_header_name`

| Value form | Extraction |
|-----------|-----------|
| `X-Session-ID` (any header) | Full header value (MCP: `mcp-session-id`) |
| `cookie:JSESSIONID` | Named cookie |
| `query:sessionid` | URL query parameter |
| `basic-auth` | Username from `Authorization: Basic` |
| *(empty)* | Source-IP stickiness fallback |

---

## Supported Protocols (`protocol` field)

LB rules accept `tcp`, `udp`, `sctp`, `icmp`.

- **TCP** — full conntrack; idle timeout per rule via `inactiveTimeOut`
- **UDP** — inactivity-based aging
- **SCTP** — telco signaling (Diameter, NGAP/SBI); multi-homing supported via `secondaryIPs` on the LB rule and Multus multi-network setups in Kubernetes
- **ICMP** — ping load balancing / responders
- **QUIC / HTTP3** — UDP rules with `sel: 7` (quiccid) for connection-ID affinity
- **5G user plane** — `sel: 5`/`6` (N2/N3 variants); 5G session steering via `/config/session`
- Other telco features (GTP, SRv6, NAT64) are inherited from upstream loxilb — see https://loxilb-io.github.io/loxilbdocs/

---

## Health Checks

Per-rule fields (flat in `serviceArguments`; enable with `monitor: true`):

| Field | Values / meaning |
|-------|------------------|
| `probetype` | `tcp`, `udp`, `sctp`, `http`, `https`, `ping`, `none` |
| `probeport` | Target port (tcp/udp/sctp/http/https) |
| `probereq` | Request string / HTTP path |
| `proberesp` | Expected response string |
| `probeTimeout` | Probe timer (seconds) |
| `probeRetries` | Failures before marking endpoint down |

Endpoint states and delays (min/avg/max) are visible at `GET /config/endpoint/all` (`currState`). Standalone probe targets can also be managed directly via `POST /config/endpoint`.

---

## TLS & Security (per rule)

| Field | Values |
|-------|--------|
| `security` | `0` plain (default) · `1` TLS terminated at the gateway (https/tls) · `2` end-to-end HTTPS (re-encrypt to backend) |
| `mtls_frontend` | Client-cert verification: `client_cert_mode` (disabled/optional/required), CA path or inline data, CN pattern enforcement. Requires `mode: 4` + TLS |
| `mtls_backend` | Backend server-cert verification and client cert/key presentation for backend mTLS |
| `backend_protocol` | ALPN capability to the backend: `http1` (default), `http2`, `both` — use `http2`/`both` for gRPC/MCP HTTP/2 backends |
| `allowedSources` | Per-rule source-prefix allow list |

Certificates: manage via `/sni/certificates`; on-disk under the container's cert dir (e.g. `/opt/loxilb/cert/`). OPA-based L4 admission policy: `/config/opa/watcher`.

---

## AI Gateway Features (inference fork; all require `mode: 4`)

### Model-name routing
Route by requested model — `X-Model` header or JSON body `model` field — to per-model endpoint pools. `model_name` on the rule names the pool; `""` is the wildcard catch-all; no match → 503 `model_unavailable`. Combine with `host`, `path_prefix`, `path_match_mode` (disabled/prefix/exact) for URL scoping.

### KV-cache-aware routing
Send each request to the endpoint whose vLLM/SGLang KV cache already holds the longest prompt prefix. Two tiers:
- **Prefix-hash affinity (CHWBL)** — zero engine changes (`sel: 8`/`10`)
- **Engine-exact routing** — fed by the engine's KV-cache event stream: `kvExactMode` (0 off, 1 zmq, 2 nats-reserved), `kvBlockSize` (must match the engine's block/page size), `kvHashAlgo` (`sha256_cbor`/`xxhash_cbor`), `kvZmqPort` (default 5557), `kvWarmupSec` (default 30). SGLang radix-cache routing is also supported, including multi-rank data-parallel event feeds.

### Prefill/Decode (P/D) disaggregation
Two-phase proxying across prefill and decode pools with NIXL KV-transfer coordination: `pd_disagg_mode`, `pd_cache_aware_mode` (session stickiness + radix-trie prefix + min-load), `pd_session_ttl_sec`, `pd_cache_threshold` (default 20), `pd_balance_abs_threshold` (default 3). Per-endpoint: `ep_role` (1 prefill, 2 decode), `nixl_port`. Circuit breaking and endpoint health tracking included.

### SSE streaming & quotas
`sse_mode: true` suppresses idle timeout while an SSE stream is active; `max_stream_duration_sec` caps runaway streams (0 = 24 h system cap); `backend_keepalive_interval_sec` keeps backend TCP alive through cloud NAT (recommended 60). Tokens are counted from SSE chunks on the response path.

### GPU-aware routing (`sel: 9`)
Enable via `POST /config/gpu/enable`; workers push metrics to `POST /config/worker/metrics` (queue depth, KV-cache usage %). Conversation-affinity cleanup via `POST /config/gpu/conversations/cleanup`.

### MCP gateway
Session-sticky proxying of Model Context Protocol server pools: `sel: 3` + `session_header_name: "mcp-session-id"`, optional TLS termination (`security: 1`) or end-to-end HTTPS (`security: 2`), `trace_type: "mcp"` for trace tagging.

### Multi-tenant controls
API keys (`/config/ai/apikey`) and per-tenant rate limits (`/config/ai/tenant/ratelimit`). Note: these are control-plane CRUD; data-path enforcement (401/403/429) is documented as roadmap in the current docs — verify on your build.

### LLM profiles & observability
- `llm_type` selects an LLM profile for GPU-aware balancing (e.g. chat-interactive, rag-longcontext, batch-inference); profile catalogs are managed as trace catalogs (`/config/trace/catalogs`, `/config/trace/parsers`)
- `trace_type` enables deep-inspection tracing catalogs (`/config/trace/*`, OTLP export)
- Per-endpoint inference metrics via Prometheus (`/netlox/v1/metrics` after `POST /config/metrics`)

---

## Other Features

- **BGP integration** — advertise VIPs (`bgp: true` per rule; goBGP config via `/config/bgp/*`); eBGP/iBGP, policy definedsets/definitions
- **HA / clustering** — master/backup with BFD (`/config/bfd`), cluster instance state (`/config/cistate`); the inference fork also syncs P/D session and rate-limiter state between proxy instances
- **Firewall / ipfilter / security rate limiting** — `/config/firewall`, `/config/ipfilter`, `/config/securityrate`
- **IPSec** — tunnels, SAs, certificates via `/config/ipsec/*`
- **QoS policies** — `/config/policy` (rate limiting per policy ident)
- **Egress rules** — `egress: true` on LB rules; SNAT rules via `snat: true`
- **IPv6** — dual-stack VIP support; secondary IPs per service

---

## Further Reading

- **Architecture:** `architecture.md`
- **Packet Processing:** `packet-processing.md`
- **Kubernetes Integration:** `kubernetes-integration.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **API Reference:** `api-quick-reference.md`
