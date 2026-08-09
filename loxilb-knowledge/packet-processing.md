# LoxiLB Packet Processing Pipeline

<!-- provenance: synced 2026-08-01 against loxilbdocs-inference-gateway docs/concepts/architecture.md, docs/concepts/running-modes.md, docs/concepts/lb-algorithms.md, docs/ai-gateway/overview.md, loxilb-inference-gateway README.md and docs/load-balancing/, and loxitui swagger_new.yml (mode/sel enums) -->

**Purpose:** How traffic flows through LoxiLB's two data paths — the eBPF L4 pipeline and the userspace L7 fullproxy (sockproxy) used for AI/inference routing.

---

## Overview

LoxiLB has **two data paths**, selected per LB rule by the `mode` field:

1. **L4 eBPF path** (`mode` 0–3, 5) — eBPF programs attached at XDP and TC hook points perform connection tracking, NAT, and forwarding entirely in the kernel. This is the classic high-performance path inherited from upstream loxilb.
2. **L7 fullproxy path** (`mode: 4`) — the **sockproxy**, a userspace HTTP proxy. The gateway terminates the client TCP/TLS connection, parses the full HTTP request, and only then opens (or reuses) a backend connection. Every AI-inference feature (model routing, KV-cache-aware selection, P/D disaggregation, SSE handling, MCP session affinity) lives here, because L4 forwarding decides from the packet 5-tuple before any HTTP body exists.

### Why eBPF for L4?

- **Performance:** in-kernel processing at XDP/TC, no userspace round trip
- **Programmability:** LB logic updated without kernel recompilation
- **Safety:** verifier-checked programs cannot crash the kernel
- **Observability:** map inspection via bpftool, kernel tracing

**Source:** eBPF programs live in github.com/loxilb-io/loxilb-ebpf (loaded and managed by the Go control plane in github.com/loxilb-io/loxilb).

---

## L4 Pipeline (eBPF)

### Hook points

| Hook | When | Role |
|------|------|------|
| **XDP** | Before sk_buff allocation | Earliest processing: parsing, early drops/ACLs, fast-path decisions |
| **TC (ingress)** | After sk_buff creation | Main LB logic: conntrack, rule match, endpoint selection, NAT, L3/L2 forwarding |

### New connection walk-through

```
Client TCP SYN → VIP:80
  │
  ▼
XDP: parse L2/L3/L4, firewall/ACL checks, pass new flows to TC
  │
  ▼
TC ingress:
  1. Conntrack lookup by 5-tuple (sip,sport,dip,dport,proto) → MISS (new flow)
  2. LB rule lookup by (VIP, port, protocol) → rule with endpoint list
  3. Endpoint selection per rule's `sel` algorithm, skipping endpoints
     marked down by the control-plane health prober
  4. NAT transform per rule's `mode` (see NAT modes below);
     forward + reverse mappings recorded in conntrack
  5. Packet rewrite: IP/port fields + checksum update
  6. Route lookup → egress interface; neighbor (ARP) lookup → MAC rewrite
  │
  ▼
Packet egresses to selected backend
Return traffic hits the reverse conntrack entry → reverse NAT → client sees VIP
```

### Established connections (fast path)

Once a flow is in conntrack, subsequent packets skip rule matching and endpoint selection entirely — a single conntrack lookup yields the cached NAT transform. This is why per-flow cost drops sharply after the first packet.

### Control plane ↔ data plane

The Go control plane validates REST config changes, translates them into eBPF map entries (rules, endpoints, NAT, conntrack, per-CPU statistics), and pushes them via BPF syscalls; programs see updates on the next packet. Endpoint health state is written by the control-plane prober and read by the in-kernel selection logic. Stale conntrack entries are aged out by the control plane.

---

## NAT Modes (`mode` field)

### `0` — DNAT (default)
- DNAT only: VIP → backend IP; **client source IP preserved**
- Requires symmetric routing (return traffic must pass back through loxilb)
- Use when backends need the real client IP

### `1` — onearm
- DNAT + SNAT to loxilb's **interface IP**
- Backend routes replies to the LB interface IP; typical for same-L2 single-arm topologies

### `2` — fullnat
- DNAT + SNAT to the **VIP** (different port)
- Works with any topology — return path is guaranteed; backend sees VIP as client
- Client identity can be conveyed with `proxyprotocolv2: true`

```
Client (1.2.3.4:5000) → VIP:80
  ↓ DNAT + SNAT
Backend sees: VIP:60000 → 10.0.1.5:8080
  ↓ reply to VIP → reverse NAT
Client sees: VIP:80 → 1.2.3.4:5000
```

### `3` — dsr (Direct Server Return)
- DNAT on the request path only; **response bypasses loxilb** and goes straight to the client
- Backend must hold the VIP on loopback and suppress ARP for it:
```bash
ip addr add <VIP>/32 dev lo
echo 1 > /proc/sys/net/ipv4/conf/lo/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/lo/arp_announce
```
- Highest throughput mode; ideal for large responses (streaming, downloads)

### `5` — hostonearm
- Host one-arm L4 variant

(`mode: 4` is not a NAT mode — it diverts the rule to the userspace L7 fullproxy, next section. `mode: 6` (aigw) exists in the schema but is not the exercised path.)

---

## Endpoint Selection (`sel` field)

L4-evaluated algorithms:

| `sel` | Algorithm | Behavior |
|-------|-----------|----------|
| `0` | Round-robin | Even rotation over healthy endpoints |
| `1` | Hash | Tuple hash — same flow key always maps to the same backend |
| `2` | Weighted RR | Rotation proportional to endpoint `weight` |
| `3` | Persist | Source-based stickiness (at L7 with `session_header_name`: header/cookie/query key) |
| `4` | Least connections | Fewest active connections wins |
| `5`/`6` | n2 / n3 | 5G telco interface variants |
| `7` | quiccid | QUIC connection-ID affinity for UDP/QUIC |

L7-evaluated algorithms (fullproxy only — they need the request content):

| `sel` | Algorithm | Behavior |
|-------|-----------|----------|
| `8` | CHWBL | Consistent hash of the prompt prefix (model + system prompt, optionally session/RAG context) onto a vnode ring, with a bounded-load ceiling so hot prefixes spill instead of saturating one GPU |
| `9` | GPU-aware | Least-loaded GPU by live worker metrics (queue depth, KV-cache pressure) |
| `10` | WRR-hash | CHWBL hashing with weight-proportional vnode distribution |

Unhealthy endpoints (probe state down) are skipped by all algorithms.

---

## L7 Pipeline (fullproxy / sockproxy, `mode: 4`)

The fullproxy is a **userspace HTTP proxy**, not an eBPF program. Request lifecycle:

```
Client request (e.g. POST /v1/chat/completions)
  │
  ▼
1. TLS termination (security: 1 terminate / 2 end-to-end re-encrypt; 0 = plain)
  │
  ▼
2. HTTP parse — extract model ("model" body field or X-Model header),
   headers (session keys like mcp-session-id), prompt body, URL path
  │
  ▼
3. Stage 1 — model pool selection: match model against rules' model_name;
   "" = wildcard pool; no match → 503 model_unavailable
  │
  ▼
4. Stage 2 — endpoint selection inside the pool (sel: rr / persist /
   CHWBL / GPU-aware / WRR-hash; or engine-exact KV routing when a
   KV-cache event stream is wired)
  │
  ▼
5. Optional P/D orchestration (pd_disagg_mode): prefill leg to a prefill
   endpoint (ep_role: 1), then decode leg to a decode endpoint (ep_role: 2),
   with NIXL KV-transfer parameters carried between them
  │
  ▼
6. Backend forwarding over the negotiated backend_protocol (http1/http2/both,
   ALPN on TLS backend legs) → SSE stream relay (sse_mode: idle-timeout
   suppression, max_stream_duration_sec cap, backend keepalive) →
   token accounting from SSE chunks
```

### KV-cache-aware selection

The control plane's **KV-cache selector** runs continuously beside this path: vLLM/SGLang backends publish KV-cache events over ZMQ (`kvZmqPort`, default 5557), and the selector maintains an inventory of which endpoint holds which prompt-prefix blocks. With `kvExactMode: 1`, block-hash routing (hash contract: `kvBlockSize` and `kvHashAlgo` must match the engine — CBOR/xxhash or SHA-256 style depending on engine) is inserted between trie-based prefix matching and min-load fallback, so step 4 reflects live cache locality rather than a static hash. SGLang radix-cache routing including multi-rank data-parallel event feeds is supported.

### HA for L7 state

In HA pairs, sockproxy state (P/D sessions, rate limiter) is synchronized between instances (xSync), so long-lived streams and session affinity survive failover.

---

## Protocol-Specific Handling

- **SCTP multi-homing** — an association can span multiple client/server IPs; LB rules carry `secondaryIPs`, and all paths of the association are tracked. Used by 5G/telco signaling (NGAP, Diameter).
- **QUIC** — `sel: 7` keys selection on the QUIC connection ID so a connection survives client address migration.
- **5G user plane** — session steering configured via `/config/session`; `sel: 5`/`6` cover N2/N3 patterns. Further GTP/SRv6 detail is upstream-loxilb territory: https://loxilb-io.github.io/loxilbdocs/

---

## Debugging the Data Path

### eBPF (L4)
```bash
bpftool prog show            # loaded programs
bpftool map show             # maps
bpftool map dump id <id>     # live map contents (conntrack, rules, stats)
sudo cat /sys/kernel/debug/tracing/trace_pipe   # bpf_printk traces (debug builds)
```

### REST-level observability
```bash
# Conntrack table as the control plane sees it
curl -s http://<host>:11111/netlox/v1/config/conntrack/all
# Endpoint probe states
curl -s http://<host>:11111/netlox/v1/config/endpoint/all
# Raise log verbosity
curl -s -X POST http://<host>:11111/netlox/v1/config/params -d '{"logLevel":"debug"}'
# L4 sampling trace
curl -s -X POST http://<host>:11111/netlox/v1/config/l4trace/enable
# L7 deep-inspection tracing (catalogs/parsers, OTLP export)
curl -s -X POST http://<host>:11111/netlox/v1/config/trace/enable
```

### Kernel caveat (GPU/KV deployments)
Host kernel **6.8** is the validated choice for KV-cache-aware / P/D setups; kernels **6.12.53+, 6.14, 6.17.5+** fall in a BPF-verifier regression range that breaks the eBPF data plane.

---

## Packet Drop / Error Behavior

| Condition | Behavior |
|-----------|----------|
| Firewall/ACL deny | Dropped at the eBPF layer |
| No LB rule match | Packet passes to the kernel stack (not LB traffic) |
| All backends down | Connection fails; endpoint states visible via `GET /config/endpoint/all` |
| L7: unknown model, no wildcard pool | HTTP 503 `model_unavailable` |
| L7: SSE exceeds `max_stream_duration_sec` | Stream terminated at the wall-clock cap |

---

## Further Reading

- **Architecture Overview:** `architecture.md`
- **Features (mode/sel enums, AI fields):** `features.md`
- **API Reference:** `api-quick-reference.md`
- **Troubleshooting:** `troubleshooting.md`
- **eBPF source:** github.com/loxilb-io/loxilb-ebpf
- **AI routing deep dives:** `docs/load-balancing/` in github.com/loxilb-io/loxilb-inference-gateway
