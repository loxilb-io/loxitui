# LoxiLB Monitoring Guide

<!-- provenance: synced 2026-08-01 against LoxiLB inference-gateway docs (docs/operations/monitoring.md, docs/operations/observability-metrics-grafana.md, docs/operations/troubleshooting.md) and loxilb-io/loxilb-inference-gateway (deploy/monitoring/prometheus/prometheus.yml, deploy/monitoring/prometheus/rules/loxilb-alerts.yml, deploy/monitoring/grafana/dashboards/) -->

**Purpose:** Production monitoring setup using Prometheus, Grafana, and alerting for LoxiLB load balancers and the LoxiLB Inference Gateway.
**Target Audience:** SREs, platform engineers, DevOps teams

---

## Quick Start

### Enable Metrics (OFF by default)

Metrics collection is **disabled by default**. Until enabled, the endpoint answers `HTTP 503` and Prometheus records the target as `up == 0`.

```bash
# Enable Prometheus metrics collection (control-plane call)
curl -X POST http://127.0.0.1:11111/netlox/v1/config/metrics

# Or with loxicmd
loxicmd set metrics --enable
loxicmd get metrics   # confirm current setting
```

### Access the Metrics Endpoint

The metrics endpoint is a **control-plane REST route** on the API listener (port **11111**) — not a separate port:

```bash
curl -s http://127.0.0.1:11111/netlox/v1/metrics | head
```

- Scrape path: `metrics_path: /netlox/v1/metrics`, port `11111`.
- If an API auth mode is enabled (`--userservice` / `--oauth2` / manual token), `/metrics` returns `401` without a token on every listener — the scraper must send `Authorization: Bearer <token>`. LoxiLB user JWTs are short-lived (~24 h); prefer network isolation over auth for unattended scrapes.
- With `--tls`, metrics are also served at `https://<host>:8091` — but `--tls` does **not** close the plain `:11111` listener. Firewall or localhost-bind `:11111` in production (`--host 127.0.0.1`).
- **Lazy registration:** several metric families (request/KV series) only appear after the first request flows. Fire one warm-up request through the VIP before validating.

---

## Reference Monitoring Stack

A deploy-as-code stack (Prometheus + Grafana, provisioned dashboards) ships at
[`deploy/monitoring/`](https://github.com/loxilb-io/loxilb-inference-gateway/tree/main/deploy/monitoring) in `loxilb-io/loxilb-inference-gateway`.

```bash
cd deploy/monitoring
cp .env.example .env        # set Grafana admin password
docker compose up -d        # Prometheus :9090 + Grafana :3000 on host network
curl -X POST http://127.0.0.1:11111/netlox/v1/config/metrics   # enable collection
```

Run the stack **on the LoxiLB host** so scraping never depends on external routing. Dashboards are provisioned into a **LoxiLB** Grafana folder.

### Scrape Config (shipped prometheus.yml)

```yaml
global:
  scrape_interval: 10s      # aligned to LoxiLB's 10s stats sweep; do not lower
  scrape_timeout: 5s
  evaluation_interval: 10s

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  - job_name: loxilb
    scheme: http
    metrics_path: /netlox/v1/metrics
    static_configs:
      - targets: ["127.0.0.1:11111"]
```

**Keep the scrape interval at 10s.** It matches LoxiLB's internal 10-second stats sweep — scraping faster only re-reads the same snapshot; scraping slower halves the resolution of per-sweep sampled gauges.

### Side-Car Exporters Need Their Own Jobs

Two optional components serve separate `/metrics` endpoints that are **not** scraped by default:

- **`loxilb-ai-controller`** — `--metrics-addr` (default `:18857`, env `AICTRL_METRICS_ADDR`). Source of all `aictrl_*` series.
- **`loxilb-kv-agent`** — `--listen` (default `:9099`).

```yaml
- job_name: loxilb-ai-controller
  static_configs:
    - targets: ["127.0.0.1:18857"]
```

---

## Essential Metrics Catalog

Names below are the exact exported names — copy them verbatim into PromQL. All series carry the `loxilb_` prefix.

### Core Load Balancer

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_healthy_endpoints` | Gauge | Endpoints currently passing health probes |
| `loxilb_unhealthy_endpoints` | Gauge | Endpoints currently failing probes |
| `loxilb_lb_rules` | Gauge | Configured load-balancer rules |
| `loxilb_l4_error_events_total` | Counter | Event-driven L4 error signal (backend RST, protocol error, SCTP abort); labels `proto` / `reason` |

### Connections & Traffic (L4)

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_active_conntrack_entries` | Gauge | Active connection-tracking entries |
| `loxilb_conntrack_max_entries` | Gauge | Conntrack capacity (for utilization ratios) |
| `loxilb_active_flow_count_tcp` / `_udp` / `_sctp` | Gauge | Active flows per protocol |
| `loxilb_new_flows` | Gauge | New flows per interval |
| `loxilb_requests_total` | Counter | Total requests processed |
| `loxilb_processed_bytes_total` | Counter | Total bytes processed |
| `loxilb_processed_tcp_packets_total` / `_udp_` / `_sctp_` | Counter | Packets per protocol |
| `loxilb_service_requests_total{service}` | Counter | Per-service requests (requires **named** LB rules) |
| `loxilb_service_errors_total{service}` | Counter | Per-service errors |
| `loxilb_service_traffic_bytes_total{service}` | Counter | Per-service bytes |
| `loxilb_conntrack_stat_resets_total` | Counter | Conntrack counter-baseline resets (brief under-reporting) |

**Per-service series need named rules:** create rules with `--name=<svc>`; unnamed rules leave the `service` label empty and per-service panels stay blank.

**Conntrack caveat:** conntrack-derived metrics reflect **established** sessions only; flows shorter than one 10s sweep may never be sampled — L7/AI metrics cover that traffic instead.

### System

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_system_cpu_utilization_percent` | Gauge | Host CPU % |
| `loxilb_system_memory_utilization_percent` | Gauge | Host memory % |
| `loxilb_system_disk_utilization_percent` | Gauge | Host disk % |

### L7 Proxy (fullproxy, mode 4)

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_proxy_http_responses_total` | Counter | HTTP responses |
| `loxilb_proxy_http_responses_by_status_total` | Counter | Responses by status class |
| `loxilb_proxy_http_ttfb_seconds_bucket` | Histogram | Time-to-first-byte (p50/p95/p99) |
| `loxilb_proxy_active_connections` | Gauge | Active proxied connections |
| `loxilb_proxy_active_ssl_connections` | Gauge | Active TLS connections |
| `loxilb_proxy_conversation_hits_total` / `_misses_total` | Counter | Session-affinity hits/misses |

### AI Gateway (Inference)

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_ai_requests_total` | Counter | AI requests; labels `model` / `status` / `tenant`. Increments at **SSE stream completion** |
| `loxilb_ai_request_duration_seconds` | Histogram | End-to-end AI request duration (buckets reach 300 s for SSE) |
| `loxilb_ai_active_streams` | Gauge | In-flight SSE streams |
| `loxilb_ai_rate_limit_hits_total` | Counter | Rate-limit denials (**not** counted in `loxilb_ai_requests_total`) |
| `loxilb_ai_model_not_allowed_total` | Counter | Requests rejected because model not permitted |
| `loxilb_ai_pd_requests_total` | Counter | Prefill/decode (P/D) disaggregated requests |
| `loxilb_ai_pd_prefill_duration_seconds` | Histogram | P/D prefill stage duration |
| `loxilb_ai_pd_decode_ttft_seconds` | Histogram | P/D decode time-to-first-token |

### KV Tier-1.5 Routing

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_pd_kv_tier15_hits_total` | Counter | Tier-1.5 cache hits |
| `loxilb_pd_kv_t15_fallthrough_total` | Counter | Requests that fell through to next tier |
| `loxilb_pd_kv_t15_miss_reason_total{reason}` | Counter | Miss reasons |
| `loxilb_pd_kv_tier15_spills_total` | Counter | Bounded-load spills |
| `loxilb_pd_kv_stage_duration_seconds` | Histogram | Per-stage latency; labels `stage` (`tokenize`/`hash`/`cgo`/`scan`) and `outcome` (`hit`/`miss`) |
| `loxilb_pd_admission_inflight` | Gauge | Global P/D in-flight footprint (compare to `LLB_PD_MAX_TOTAL_INFLIGHT`) |
| `loxilb_pd_admission_total_blocked_total` | Counter | Accepts blocked by the global admission cap — earliest back-pressure signal |
| `loxilb_kv_agent_up` | Gauge | KV-agent liveness (LoxiLB-side signal) |

**Naming caveat:** KV-tier series are inconsistently prefixed — some `tier15_`, some `t15_` (hits vs fallthrough above). Copy exact names from a live `/metrics` scrape before writing PromQL; a wrong guess silently returns no data.

### Security & Firewall

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_fw_drop_packets_total` | Counter | Firewall drops |
| `loxilb_fw_rule_drop_packets_total` | Counter | Drops per rule |
| `loxilb_firewall_rules` | Gauge | Configured FW rules |
| `loxilb_security_syn_blocked_total` / `_passed_total` | Counter | SYN-flood mitigation |
| `loxilb_security_udp_blocked_total` / `_passed_total` | Counter | UDP-flood mitigation |
| `loxilb_security_conn_blocked_total` / `_passed_total` | Counter | Connection-rate mitigation |
| `loxilb_ipfilter_blacklist_packets_total` / `_whitelist_` | Counter | IP-filter hits |

### HA Sync

| Metric | Type | Description |
|--------|------|-------------|
| `loxilb_sockproxy_sync_apply_errors_total` | Counter | Peer state application failures (HA correctness at risk) |
| `loxilb_sockproxy_sync_conflict_total` / `_drop_total` / `_overflow_total` | Counter | Sync anomalies |
| `loxilb_sockproxy_sync_push_latency_seconds_bucket` | Histogram | Sync push latency |

---

## Grafana Dashboards

The stack provisions six dashboards into the **LoxiLB** folder (each drill-down links back to Overview):

| Dashboard | Answers |
|-----------|---------|
| **LoxiLB / Overview** | Is the gateway healthy right now? — up/health verdict tiles, traffic at a glance, CPU/memory/disk |
| **LoxiLB / L4 Load Balancer** | Where is traffic going, is it balanced? — per-service requests/errors/throughput, conntrack, top clients, FW drops |
| **LoxiLB / L7 Proxy** | Why did latency or errors change? — status classes, TTFB quantiles, session affinity |
| **LoxiLB / AI Gateway** | Are models serving, who is throttled? — AI requests by model/status, duration, active streams, rate-limit hits, P/D and KV rows |
| **LoxiLB / Security** | Is an attack or policy drop happening? — flood counters, blocked ratio, ipfilter hits |
| **LoxiLB / Monitoring Bootstrap** | Is the stack itself wired up? — gateway up, series count, firing alerts, scrape duration |

---

## Alert Rules (shipped)

Shipped in [`deploy/monitoring/prometheus/rules/loxilb-alerts.yml`](https://github.com/loxilb-io/loxilb-inference-gateway/tree/main/deploy/monitoring/prometheus/rules). Every ratio alert carries a traffic guard (no `0/0` firing on idle systems). Severity model: critical = page, warning = ticket, info = annotation.

| Alert | Condition | For | Severity |
|-------|-----------|-----|----------|
| `LoxilbScrapeDown` | `up{job="loxilb"} == 0` | 1m | critical |
| `LoxilbNoHealthyEndpoints` | `loxilb_healthy_endpoints == 0 and loxilb_lb_rules > 0` | 1m | critical |
| `LoxilbUnhealthyEndpoints` | `loxilb_unhealthy_endpoints > 0` | 5m | warning |
| `LoxilbHigh5xxRatio` | L7 5xx ratio > 5% (traffic-guarded) | 5m | critical |
| `LoxilbElevated5xxRatio` | L7 5xx ratio > 1% (traffic-guarded) | 10m | warning |
| `LoxilbL4ErrorBurst` | `sum(rate(loxilb_l4_error_events_total{reason!="rst_client"}[5m])) > 1` | 10m | warning |
| `LoxilbHighTTFB` | L7 TTFB p95 > 2s (site-tunable) | 10m | warning |
| `LoxilbAIErrorRatio` | AI non-2xx ratio > 5% (traffic-guarded) | 5m | critical |
| `LoxilbAIRateLimitSpike` | `sum(rate(loxilb_ai_rate_limit_hits_total[5m])) > 10` | 5m | warning |
| `LoxilbCpuHigh` / `LoxilbMemHigh` / `LoxilbDiskHigh` | utilization > 90% | 10m | warning |
| `LoxilbDiskCritical` | disk > 95% | 5m | critical |
| `LoxilbHaSyncFailing` | `rate(loxilb_sockproxy_sync_apply_errors_total[5m]) > 0` | 5m | critical |
| `LoxilbKvAgentDown` | `loxilb_kv_agent_up == 0 and max_over_time(loxilb_kv_agent_up[1h]) == 1` | 2m | warning |
| `LoxilbSynFloodActive` / `LoxilbUdpFloodActive` | flood mitigation actively blocking | 2m | info |
| `LoxilbFwDropSurge` | `rate(loxilb_fw_drop_packets_total[5m]) > 100` | 5m | warning |
| `LoxilbConntrackNearCapacity` | `loxilb_active_conntrack_entries / loxilb_conntrack_max_entries > 0.8` | 5m | warning |
| `LoxilbConntrackCapacityCritical` | ratio > 0.95 | 5m | critical |

Thresholds (TTFB 2s, rate-limit 10/s, CPU/mem/disk %) are reference defaults collected at the top of the rules file — tune to your fleet.

**`LoxilbScrapeDown` has two causes:** `up == 0` means the process/network is down **or** metrics collection is disabled (endpoint returns 503). Check `POST /netlox/v1/config/metrics` before assuming a process failure.

---

## Common PromQL Queries

```promql
# Requests per second
rate(loxilb_requests_total[1m])

# L7 TTFB p95
histogram_quantile(0.95, rate(loxilb_proxy_http_ttfb_seconds_bucket[5m]))

# Bandwidth (Gbps)
rate(loxilb_processed_bytes_total[1m]) * 8 / 1e9

# Conntrack utilization %
loxilb_active_conntrack_entries / loxilb_conntrack_max_entries * 100

# Endpoint availability %
loxilb_healthy_endpoints / (loxilb_healthy_endpoints + loxilb_unhealthy_endpoints) * 100

# Top 10 services by RPS (requires named rules)
topk(10, rate(loxilb_service_requests_total[5m]))

# Per-service error rate %
rate(loxilb_service_errors_total[5m]) / rate(loxilb_service_requests_total[5m]) * 100

# AI RPS by model
sum by (model) (rate(loxilb_ai_requests_total[1m]))

# AI request duration p95
histogram_quantile(0.95, rate(loxilb_ai_request_duration_seconds_bucket[5m]))

# KV Tier-1.5 hit rate % (note the mixed tier15_/t15_ prefixes — copy verbatim)
rate(loxilb_pd_kv_tier15_hits_total[5m])
  / (rate(loxilb_pd_kv_tier15_hits_total[5m]) + rate(loxilb_pd_kv_t15_fallthrough_total[5m])) * 100

# KV stage latency p95 on cache hits (which stage is slow: tokenize/hash/cgo/scan)
histogram_quantile(0.95,
  rate(loxilb_pd_kv_stage_duration_seconds_bucket{stage="hash", outcome="hit"}[5m]))

# P/D decode TTFT p95
histogram_quantile(0.95, rate(loxilb_ai_pd_decode_ttft_seconds_bucket[5m]))

# Global admission back-pressure (earliest over-subscription warning)
rate(loxilb_pd_admission_total_blocked_total[5m])
```

---

## Verify the Pipeline

```bash
# Target is up (1 = healthy scrape)
curl -s 'http://<host>:9090/api/v1/query?query=up{job="loxilb"}'

# Core health gauges present
curl -s http://127.0.0.1:11111/netlox/v1/metrics | grep -E 'loxilb_(healthy|lb_rules)'
```

In Grafana, open **LoxiLB / Overview**: the *Gateway up* tile should be green and CPU/memory/disk gauges should read live values.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/metrics` returns 503 | Collection never enabled | `POST /netlox/v1/config/metrics`; `up` recovers within one 10s interval |
| `/metrics` returns 401 | An API auth mode is enabled | Add `authorization: { type: Bearer, credentials: "<token>" }` to the scrape job |
| Per-service metrics never appear | LB rule has no name | Create rules with `--name=<svc>` |
| Endpoint health never changes | Endpoints not actually probed | `--monitor` alone leaves probe type `none`; configure a real probe (`--probetype=tcp --probeport=<port>`) |
| Conntrack panels read 0 under load | Sessions shorter than one 10s sweep | Expected; use L7/AI metrics for short flows |
| Expected KV/request series absent | Lazy registration | Fire one warm-up request through the VIP, re-scrape |
| Edited alert rule never fires | Rules on disk ≠ rules loaded | Reload Prometheus (`docker kill -s HUP loxilb-prometheus`), verify via `GET /api/v1/rules` |
| Target DOWN with TLS error | Scheme mismatch | Match `scheme` to how the API is served (`http` :11111 / `https` :8091) |

---

## Further Reading

- **Architecture:** `architecture.md`
- **Troubleshooting:** `troubleshooting.md`
- **Performance Tuning:** `performance.md`
- **API Reference:** `api-quick-reference.md`
- **HA Clustering:** `ha-clustering.md`
