# LoxiLB Performance Tuning Guide

<!-- provenance: synced 2026-08-01 against LoxiLB inference-gateway docs (docs/use-cases/performance-methodology.md, docs/use-cases/configuration-tuning.md, docs/concepts/running-modes.md, docs/reference/system-requirements.md, docs/operations/monitoring.md), loxilb-io/loxilb-inference-gateway (README.md, loxilb-ebpf/common/llb_dpapi.h map sizes) -->

**Purpose:** Performance optimization strategies, benchmarking methodology, and capacity planning for LoxiLB deployments.
**Target Audience:** Performance engineers, solution architects, platform teams

**On published numbers:** LoxiLB's official position is *measure your own fleet* — the docs ship a benchmarking method, not a results table. Upstream comparative benchmarks are published at https://loxilb-io.github.io/loxilbdocs/perf-single/ and https://loxilb-io.github.io/loxilbdocs/perf-multi/. Do not quote throughput/latency figures that were not measured on your hardware.

---

## Performance Factors

### 1. Data Path: L4 (eBPF) vs L7 (fullproxy)

| Path | Modes | Characteristics |
|------|-------|-----------------|
| **eBPF fast path** | `0` DNAT, `1` onearm, `2` fullnat, `3` dsr, `5` hostonearm | Kernel-level packet forwarding on the 5-tuple; highest throughput, lowest latency; no HTTP parsing |
| **L7 fullproxy** | `4` fullproxy | Userspace HTTP proxy; terminates connections; required for all AI/L7 features (model routing, KV-cache routing, P/D, SSE) |

Rules that don't need L7/AI features should stay on the eBPF path. DSR additionally bypasses LoxiLB on the return path — best for response-heavy workloads (large downloads, streaming), at the cost of source-NAT/observability trade-offs and backend VIP-on-loopback setup.

### 2. Endpoint Selection Algorithm (`sel`)

| `sel` | Algorithm | Cost profile | Best for |
|-------|-----------|--------------|----------|
| `0` | Round robin | Lowest | Equal-capacity backends |
| `1` | Hash | Low | Flow affinity |
| `2` | Priority/weighted | Low | Heterogeneous backends |
| `3` | Source persist | Session table | Stateful apps |
| `4` | Least connections | Conntrack lookups | Long-lived connections |
| `8` | CHWBL (consistent hash, bounded load) | Low | LLM prefix-cache affinity without engine changes |
| `9` | GPU-aware selection | Metrics-driven | Unique one-shot inference queries |
| `10` | Weighted CHWBL | Low | Mixed-capacity LLM fleets |

Prefer stateless algorithms (rr, hash) for maximum L4 performance; use CHWBL variants for inference affinity.

---

## System Tuning (Linux Kernel)

Standard Linux network tuning applies to the LoxiLB host:

```bash
# /etc/sysctl.d/99-loxilb.conf
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
net.core.netdev_max_backlog = 50000
net.core.somaxconn = 4096

sudo sysctl -p /etc/sysctl.d/99-loxilb.conf
```

```bash
# DSR mode: disable reverse-path filtering
echo 0 > /proc/sys/net/ipv4/conf/all/rp_filter

# RPS/RFS: distribute RX processing across CPUs
for i in /sys/class/net/eth0/queues/rx-*/rps_cpus; do echo "ff" > $i; done
echo 32768 > /proc/sys/net/core/rps_sock_flow_entries
```

LoxiLB has an experimental `--rss-enable` flag for RSS optimization.

### Kernel Version (critical for KV/P/D deployments)

Kernels **6.12.53+, 6.14, and 6.17.5+** fall in a BPF-verifier regression range that breaks the eBPF data plane. For GPU / KV-cache-aware / P/D deployments use kernel **6.8** on the gateway host, NVIDIA driver 570.x on GPU nodes, and the Ubuntu 24.04 gateway image. Pin the host kernel before rolling out GPU routing.

### NIC Configuration

```bash
ethtool -G eth0 rx 4096 tx 4096      # ring buffers to max
ethtool -L eth0 combined 8            # multi-queue = CPU cores
ethtool -K eth0 gso on tso on gro on  # offloads
# Keep rx/tx checksum offload ENABLED
```

---

## LoxiLB Configuration Tuning

### Session Timeouts

Idle timeout is **per LB rule**, not a global daemon flag: the `inactiveTimeOut` field in `serviceArguments` (Kubernetes: `loxilb.io/timeout` annotation; loxicmd: `--inatimeout`). For high connection-turnover services, lower it so conntrack entries expire faster; for SSE/streaming services set `sse_mode: true` instead (suppresses idle timeout while the stream is active).

### eBPF Map Capacities (defaults, from `loxilb-ebpf/common/llb_dpapi.h`)

| Map | Default size |
|-----|-------------|
| Conntrack (`LLB_CT_MAP_ENTRIES`) | 512K entries (256K × 2 nodes) |
| LB/NAT rules (`LLB_NATV4_MAP_ENTRIES`) | 4,096 |
| Endpoints per rule (`LLB_MAX_NXFRMS`) | 32 |
| Firewall v4 (`LLB_FW4_MAP_ENTRIES`) | 8,192 |
| Session map (`LLB_SESS_MAP_ENTRIES`) | 20K |

Raising these requires rebuilding the eBPF data plane (constants in `loxilb-ebpf`, public at https://github.com/loxilb-io/loxilb-ebpf). Track utilization with `loxilb_active_conntrack_entries / loxilb_conntrack_max_entries` — shipped alerts fire at 80% (warning) and 95% (critical).

### Health Probe Efficiency

TCP probes are cheaper than HTTP. Tune `--probetype`, `--probeport`, `--period`, `--retries` per endpoint: shorter periods detect failure faster but cost CPU.

### DSR Backend Setup

```bash
# On each backend
ip addr add <VIP>/32 dev lo
echo 1 > /proc/sys/net/ipv4/conf/lo/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/lo/arp_announce
```

Return traffic bypasses LoxiLB entirely; near-zero added response latency.

---

## Inference Gateway Performance (AI workloads)

### Admission Control (opt-in back-pressure)

All are LoxiLB container env vars, read at startup:

| Knob | Default | Guidance |
|------|---------|----------|
| `LLB_PD_MAX_INFLIGHT_PER_EP` | 0 (off) | Per-endpoint in-flight prefill cap; set near the concurrency where prefill queue divergence begins |
| `LLB_PD_QUEUE_DEPTH_PER_EP` | 0 (off) | Park queue depth (hold-don't-drop); 8–16 typical |
| `LLB_PD_MAX_PARK_SEC` | 0 (→ prefill timeout) | Parked-request reap deadline |
| `LLB_PD_MAX_TOTAL_INFLIGHT` | 0 (off) | Global valve — SYNs beyond the cap stay in the listen backlog |
| `LLB_PD_PREFILL_TIMEOUT_SEC` | 30 | **Raise to ≥180 for long-context (~32k) fleets** — the default times out most long-context requests under load |

Enable admission gates only with a latency SLO to protect. Watch `loxilb_pd_admission_inflight` vs your cap, and `loxilb_pd_admission_total_blocked_total` (rising rate = earliest over-subscription warning).

### KV Routing Cost Diagnostics

`loxilb_pd_kv_stage_duration_seconds{stage, outcome}` splits Tier-1.5 routing latency into `tokenize` / `hash` / `cgo` / `scan` stages with `hit`/`miss` outcomes — the diagnostic for "why is KV routing slow?" and whether routing cost is repaid in TTFT savings. `kvWarmupSec` (default 30 s) delays Tier-1.5 activation after subscriber start; increase to 60 s+ when engines restart under load.

### Benchmarking AI Routing: goodput@SLO

The documented methodology (DistServe-style):

- Per-request **TTFT** (time to first token) and **TPOT** (time per output token)
- A request is *good* iff `TTFT ≤ TTFT_SLO AND TPOT ≤ TPOT_SLO` (conjunction — both)
- Failed/timed-out requests count against the denominator (never dropped)
- **goodput@SLO** = good-throughput at the knee: sweep offered load, find the highest rate where good-fraction still clears the target (conventionally 90%)

Five-phase flow: health check → calibrate per-endpoint capacity → probe that the routing mechanism is mechanically engaged → trace replay per configuration at controlled load → statistical verdict with validity gates. Always verify a routing feature actually fired (hit counters advancing) before crediting it — misconfigured KV routing silently degrades to round-robin and benchmarks the wrong thing.

---

## Benchmarking (classic L4/L7)

```bash
# HTTP: wrk
wrk -t4 -c100 -d30s http://<VIP>/

# HTTP: Apache Bench (connection-rate testing with -k off)
ab -n 100000 -c 100 http://<VIP>/

# TCP throughput: iperf3
iperf3 -s -p 5201                      # backend
iperf3 -c <VIP> -t 30 -P 10            # client via VIP
```

Monitor during runs:

```bash
curl -s http://127.0.0.1:11111/netlox/v1/metrics | grep -E 'loxilb_(new_flows|active_conntrack)'
loxicmd get conntrack | wc -l
```

Best practice from the perf methodology: warm up before measuring, replay the same workload across configurations at the same offered load, run multiple repetitions, and report variance — a single lucky run is not a result.

---

## Monitoring Performance

```promql
# Requests per second
rate(loxilb_requests_total[1m])

# Bandwidth (Gbps)
rate(loxilb_processed_bytes_total[1m]) * 8 / 1e9

# Conntrack utilization %
loxilb_active_conntrack_entries / loxilb_conntrack_max_entries * 100

# L7 TTFB p95
histogram_quantile(0.95, rate(loxilb_proxy_http_ttfb_seconds_bucket[5m]))
```

### Saturation Indicators

| Indicator | Threshold | Action |
|-----------|-----------|--------|
| `loxilb_system_cpu_utilization_percent` | > 90% (shipped alert) | Scale horizontally (ECMP/HA) |
| Conntrack utilization | > 80% (shipped alert) | Lower per-rule idle timeouts; scale out; rebuild with larger maps |
| `loxilb_system_memory_utilization_percent` | > 90% (shipped alert) | Add memory / reduce connection load |
| `loxilb_pd_admission_total_blocked_total` rate rising | any sustained | Raise `LLB_PD_MAX_TOTAL_INFLIGHT` or add inference capacity |
| NIC drops (`ip -s link`) | growing | Ring buffers, multi-queue, RPS/RFS |

---

## Performance Troubleshooting

### High L7/AI latency

1. Check CPU (`docker stats loxilb`); >90% sustained → scale out.
2. Check TTFB histogram — is the latency in LoxiLB or the backend?
3. For KV routing: check `loxilb_pd_kv_stage_duration_seconds` per stage; verify hits are actually occurring (a broken parity leg silently measures round-robin).
4. Switch stateful selection (`lc`, `persist`) to stateless (`rr`, `hash`) where affinity isn't needed.

### Low L4 throughput

1. `ethtool -g eth0` — increase ring buffers if small.
2. `ethtool -k eth0` — confirm GSO/TSO/GRO on.
3. `ip -s link show eth0` — check RX/TX drops.
4. Consider DSR mode for response-heavy traffic.

### Connection drops

1. Conntrack near capacity? (`loxilb_active_conntrack_entries / loxilb_conntrack_max_entries`)
2. Lower per-rule `inactiveTimeOut`; scale horizontally.
3. For SSE streams dropping: set `sse_mode: true` and `backend_keepalive_interval_sec: 60` on the rule (see `troubleshooting.md`).

---

## Further Reading

- **Architecture:** `architecture.md`
- **Packet Processing:** `packet-processing.md`
- **Monitoring:** `monitoring.md`
- **Troubleshooting:** `troubleshooting.md`
- **HA Clustering:** `ha-clustering.md`
- **Upstream benchmarks:** https://loxilb-io.github.io/loxilbdocs/perf-single/
