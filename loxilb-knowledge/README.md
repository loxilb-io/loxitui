# LoxiLB Knowledge Base

<!-- provenance: synced 2026-08-01 against loxitui src/knowledge/resolve.ts + swagger_new.yml, loxilbdocs-inference-gateway docs/, and loxilb-inference-gateway README.md + docs/load-balancing/ -->

**Purpose:** Technical knowledge base auto-loaded by the AI assistant in loxitui to provide expert-level responses about LoxiLB operations, troubleshooting, and configuration — covering both classic L4/L7 load balancing and the AI/inference-gateway features (model routing, KV-cache-aware routing, P/D disaggregation, MCP gateway).

---

## How It Works

The loxitui AI assistant (`src/knowledge/loader.ts`) loads all `.md` files from this directory at startup and injects them into the LLM context when answering LoxiLB questions.

**Search order for the knowledge directory** (`src/knowledge/resolve.ts`):
1. `$LOXILB_KNOWLEDGE_PATH` (env variable)
2. Relative to the binary/script: `./loxilb-knowledge/` (also one and two levels up)
3. Current working directory: `./loxilb-knowledge/` (also one level up)
4. XDG data dir: `$XDG_DATA_HOME` (default `~/.local/share`) under `loxitui/loxilb-knowledge/`

---

## Knowledge Base Structure

### Core Technical Knowledge

**1. [architecture.md](architecture.md)**
- Components: loxilb core (Go control plane + eBPF L4 + userspace L7 fullproxy), kube-loxilb, goBGP, loxicmd, monitoring
- Inference-gateway additions: KV-cache selector, P/D coordinator
- Deployment topologies: external, in-cluster, HA; data flows

**2. [packet-processing.md](packet-processing.md)**
- eBPF L4 pipeline: XDP/TC hooks, conntrack, NAT modes (DNAT, onearm, fullnat, DSR, hostonearm)
- L7 fullproxy (sockproxy) pipeline: TLS termination, model routing, KV-cache-aware selection, P/D, SSE
- Selection algorithms (`sel` 0–10), protocol-specific handling, data-path debugging

**3. [kubernetes-integration.md](kubernetes-integration.md)**
- Service lifecycle: watch → allocate IP → discover endpoints → configure LB
- IPAM, service annotations (`loxilb.io/*`), CNI compatibility

**4. [api-quick-reference.md](api-quick-reference.md)**
- REST API catalog matching the swagger spec loxitui is built against (`swagger_new.yml`)
- LB rules, endpoints, conntrack, BGP/BFD, firewall, status, metrics, and AI endpoints (`/config/ai/*`, `/config/gpu/*`, tracing)

**5. [features.md](features.md)**
- `mode` and `sel` enums with LLM-serving guidance (CHWBL, GPU-aware, WRR-hash)
- Protocols, health checks, TLS/mTLS, and the AI-gateway feature set

**6. [configuration-patterns.md](configuration-patterns.md)**
- Docker deployment + snapshot persistence
- Worked rule patterns: classic L4, model routing, KV-cache-aware vLLM pool, P/D disaggregation, MCP gateway, monitoring, BGP/HA

### Operational Knowledge

**7. [troubleshooting.md](troubleshooting.md)** — common issues, diagnostic commands, root-cause trees
**8. [monitoring.md](monitoring.md)** — Prometheus integration, metric catalog, Grafana dashboards, alert rules
**9. [performance.md](performance.md)** — benchmarks, tuning, algorithm selection, load testing
**10. [ha-clustering.md](ha-clustering.md)** — active-backup (BFD), active-active (BGP ECMP), failover testing

---

## Usage Examples

**User Query:** "Why is my service stuck in pending?"
→ `troubleshooting.md` (External IP Pending) + `kubernetes-integration.md` (IPAM) → diagnostic tree: kube-loxilb logs, pool exhaustion, loadBalancerClass.

**User Query:** "How do I route by model name to different vLLM pools?"
→ `features.md` (model-name routing) + `configuration-patterns.md` (Pattern 2) → per-model `mode: 4` rules with `model_name`, wildcard `""` pool, 503 semantics.

**User Query:** "How do I configure SCTP multi-homing?"
→ `packet-processing.md` (SCTP) + `kubernetes-integration.md` (Multus) + `configuration-patterns.md` → `secondaryIPs` + annotations.

---

## Maintenance

**Adding new knowledge:** create a kebab-case `.md` file here, follow the existing structure (clear sections, code examples, cross-references), restart loxitui (auto-discovery, no code changes).

**Updating:** files load at TUI startup; restart to pick up edits. Verify API claims against `swagger_new.yml` and the sources below, and update the provenance comment at the top of each file.

---

## Source Attribution

Knowledge synthesized from public LoxiLB sources:
- github.com/loxilb-io/loxilb — core load balancer (upstream)
- github.com/loxilb-io/loxilb-inference-gateway — AI/inference fork; guide set under `docs/load-balancing/`; monitoring stack under `deploy/monitoring/`
- github.com/loxilb-io/loxilbdocs — official documentation (https://loxilb-io.github.io/loxilbdocs/)
- github.com/loxilb-io/kube-loxilb — Kubernetes operator
- github.com/loxilb-io/loxilb-ebpf — eBPF data plane
- github.com/loxilb-io/loxicmd — CLI
- `swagger_new.yml` in the loxitui repository — the REST API contract loxitui is built against
