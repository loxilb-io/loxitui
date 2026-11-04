# LoxiLB API Quick Reference

<!-- provenance: synced 2026-08-01 against loxitui swagger_new.yml (authoritative REST spec), loxilbdocs-inference-gateway docs/reference/api.md, docs/operations/monitoring.md, and loxilb-inference-gateway docs/load-balancing/05-rest-api-reference.md -->

**Purpose:** Quick reference to the LoxiLB REST API as consumed by loxitui.
**Base URL:** `http://<loxilb-ip>:11111/netlox/v1` (with `--tls`, an HTTPS listener is also served on `:8091`; the plain `:11111` listener stays open)

---

## Authentication

Authentication is optional; it is enforced when loxilb runs with `--userservice` (local users + JWT) or `--oauth2`. When enabled, every request needs `Authorization: Bearer <token>` — including `/netlox/v1/metrics`.

### Login
```http
POST /auth/login
Content-Type: application/json

{ "username": "admin", "password": "secret" }

Response 200:
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

### Other auth endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/logout` | Invalidate current token |
| GET / POST | `/auth/users` | List / create users |
| PUT / DELETE | `/auth/users/{id}` | Update / delete a user |
| POST | `/auth/token/upgrade` | Upgrade token |
| GET | `/oauth/{provider}`, `/oauth/{provider}/callback`, `/oauth/{provider}/token` | OAuth2 flow (when `--oauth2`) |

---

## Load Balancer Rules

### Create LB Rule (upsert)
```http
POST /config/loadbalancer

{
  "serviceArguments": {
    "externalIP": "192.168.1.100",
    "port": 80,
    "protocol": "tcp",        // tcp | udp | sctp | icmp
    "sel": 0,                 // integer: 0-rr, 1-hash, 2-priority/wrr, 3-persist, 4-lc,
                              //          5-n2, 6-n3, 7-quiccid, 8-chwbl, 9-gpuaware, 10-wrr-hash
    "mode": 2,                // integer: 0-DNAT (default), 1-onearm, 2-fullnat, 3-dsr,
                              //          4-fullproxy (L7), 5-hostonearm, 6-aigw
    "security": 0,            // 0-plain, 1-https/tls terminate, 2-e2e https
    "monitor": true,          // enable endpoint probes
    "probetype": "http",      // tcp | udp | sctp | http | https | ping | none
    "probeport": 8080,
    "probereq": "/health",    // HTTP path
    "proberesp": "ok",        // expected response
    "probeTimeout": 10,
    "probeRetries": 2,
    "inactiveTimeOut": 30,    // idle timeout (seconds)
    "bgp": false,             // advertise via BGP
    "name": "web-svc"
  },
  "endpoints": [
    { "endpointIP": "10.0.1.5", "targetPort": 8080, "weight": 1 }
  ],
  "secondaryIPs": [ { "secondaryIP": "192.168.1.101" } ],   // optional (SCTP multi-homing)
  "allowedSources": [ { "prefix": "10.0.0.0/8" } ]          // optional source allow-list
}
```

Note: probe fields are **flat** inside `serviceArguments` — there is no `livenessCheck` object. `sel`, `mode`, and `security` are integers, not strings.

**AI-gateway fields** (all opt-in, all require `mode: 4` fullproxy): `model_name`, `host`, `path_prefix`, `path_match_mode` (disabled|prefix|exact), `backend_protocol` (http1|http2|both), `sse_mode`, `max_stream_duration_sec`, `backend_keepalive_interval_sec`, `session_header_name`, `llm_type`, `trace_type`, `pd_disagg_mode`, `pd_cache_aware_mode`, `pd_session_ttl_sec`, `pd_cache_threshold`, `pd_balance_abs_threshold`, `kvExactMode`, `kvBlockSize`, `kvHashAlgo`, `kvZmqPort`, `kvWarmupSec`, `chwbl_prefix_hash_level`, `chwbl_prefix_hash_flags`, `chwbl_mean_load_factor`, `chwbl_replication`, `chwbl_enable_cache_salt`, `mtls_frontend`, `mtls_backend`, `proxyprotocolv2`, `egress`, `snat`. Per-endpoint AI fields: `ep_role` (0-normal, 1-prefill, 2-decode), `nixl_port`. See `features.md`.

### List All LB Rules
```http
GET /config/loadbalancer/all

Response 200:
{ "lbAttr": [ { "serviceArguments": {...}, "endpoints": [...] } ] }
```

### Delete LB Rules
```http
DELETE /config/loadbalancer/all
DELETE /config/loadbalancer/name/{lb_name}
DELETE /config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}
DELETE /config/loadbalancer/externalipaddress/{ip}/port/{port}/portmax/{portmax}/protocol/{proto}
DELETE /config/loadbalancer/hosturl/{hosturl}/externalipaddress/{ip}/port/{port}/protocol/{proto}
```

---

## Endpoints & Health

### Get All Endpoints
```http
GET /config/endpoint/all

Response 200 (per endpoint):
{
  "hostName": "10.0.1.5",
  "name": "ep-ident",
  "currState": "ok",          // current probe state
  "probeType": "http",
  "probePort": 8080,
  "probeDuration": 10,        // probe interval (seconds)
  "inactiveReTries": 2,
  "minDelay": "1ms", "avgDelay": "2ms", "maxDelay": "5ms"
}
```

### Manage Endpoints
```http
POST   /config/endpoint                          # attach a host to probe
DELETE /config/endpoint/epipaddress/{ip_address} # detach
POST   /config/endpointhoststate                 # force endpoint host state
```

---

## Connection Tracking

```http
GET /config/conntrack/all

Response 200 (per entry):
{
  "sourceIP": "203.0.113.50",   "sourcePort": 45678,
  "destinationIP": "192.168.1.100", "destinationPort": 80,
  "protocol": "tcp",
  "conntrackState": "est",
  "conntrackAct": "dnat",
  "packets": 1234, "bytes": 567890,
  "ident": "...", "servName": "web-svc"
}
```

There is no per-entry conntrack DELETE endpoint. Kubernetes-enriched entries additionally carry pod/namespace/node/service fields.

---

## Routes

```http
GET    /config/route/all
POST   /config/route              { "destinationIPNet": "10.0.0.0/16", "gateway": "192.168.1.1" }
DELETE /config/route/destinationIPNet/{ip_address}/{mask}
```

GET returns `hardwareMark`, `protocol`, `flags`, `sync`, and per-route `statistic` (packets/bytes).

---

## BGP & BFD

```http
GET    /config/bgp/neigh/all      # per neighbor: ipAddress, remoteAs, state, updowntime
POST   /config/bgp/neigh          { "ipAddress": "10.0.0.1", "remoteAs": 65101,
                                    "remotePort": 179, "setMultiHop": false }
DELETE /config/bgp/neigh/{ip_address}
POST   /config/bgp/global         # local AS / router-id
POST | DELETE /config/bgp/policy/definedsets/{defineset_type}[/{type_name}]
GET    /config/bgp/policy/definitions/all
POST | DELETE /config/bgp/policy/definitions[/{policy_name}]
POST | DELETE /config/bgp/policy/apply

GET    /config/bfd/all            # instance, remoteIp, sourceIp, interval(us), retryCount
POST   /config/bfd
DELETE /config/bfd/remoteIP/{remote_ip}
```

---

## Firewall & Security

```http
GET  /config/firewall/all
POST /config/firewall
{
  "ruleArguments": {
    "sourceIP": "0.0.0.0/0", "destinationIP": "192.168.1.100/32",
    "minDestinationPort": 80, "maxDestinationPort": 80,
    "protocol": 6, "preference": 100
  },
  "opts": { "allow": true }   // or drop / trap / redirect / doSnat / fwMark / record
}
DELETE /config/firewall
```

Related: `/config/ipfilter` (GET all / POST / DELETE), `/config/securityrate` (+ `POST /config/securityrate/reset`), `/config/ipsec/*` (tunnels, SAs, stats, certificates, CA certificates).

---

## Network Config

| Resource | Endpoints |
|----------|-----------|
| Ports | `GET /config/port/all` (portName, portNo, HW/SW/L2/L3/statistics sub-objects) |
| IPv4 addresses | `GET /config/ipv4address/all`, `POST /config/ipv4address`, `DELETE /config/ipv4address/{ip}/{mask}/dev/{if_name}` |
| Neighbors (ARP) | `GET /config/neighbor/all`, `POST`, `DELETE /config/neighbor/{ip}/dev/{if_name}` |
| FDB | `GET /config/fdb/all`, `POST`, `DELETE /config/fdb/{mac}/dev/{if_name}` |
| VLAN | `GET /config/vlan/all`, `POST /config/vlan`, member add/delete |
| VxLAN | `GET /config/tunnel/vxlan/all`, `POST`, peer add/delete |
| Mirror | `GET /config/mirror/all`, `POST`, `DELETE /config/mirror/ident/{ident}` |
| QoS policy | `GET /config/policy/all`, `POST /config/policy`, `DELETE /config/policy/ident/{ident}` |
| 5G sessions | `/config/session` (GET all / POST / DELETE) |
| CORS | `GET /config/cors/all`, `POST /config/cors`, `DELETE /config/cors/{cors_url}` |

---

## System Status & Cluster

```http
GET /status/process          # top-like process list
GET /status/device           # host info
GET /status/filesystem       # filesystem usage
GET /version                 # { "version": "...", "buildInfo": "..." }

GET  /config/cistate/all     # HA: per instance { instance, state (MASTER/BACKUP), vip, sync }
POST /config/cistate         # set cluster instance state

GET  /config/params          # { "logLevel": "info" }
POST /config/params          # logLevel: trace|debug|info|error|warning|notice|critical|emergency|alert
```

---

## Metrics & Observability

```http
POST   /config/metrics       # enable Prometheus collection (OFF by default; /metrics answers 503 until enabled)
GET    /config/metrics       # collection status
DELETE /config/metrics       # disable

GET /metrics                 # Prometheus text format (full path: /netlox/v1/metrics)
```

JSON metric series: `GET /metrics/{flowcount | hostcount | lbrulecount | newflowcount | requestcount | errorcount | processedtraffic | lbprocessedtraffic | epdisttraffic | servicedisttraffic | fwdrops | reqcountperclient}`.

```http
GET /logs                        # recent log lines
```

Tracing: `POST /config/trace/enable|disable`, `GET /config/trace/status`, `GET|POST /config/trace/otlp`, `GET /config/trace/catalogs`, `GET /config/trace/parsers`, catalog-parser mapping CRUD; L4 sampling trace under `/config/l4trace/*`.

---

## AI Gateway Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST / GET | `/config/ai/apikey` | Create / list tenant API keys (raw key returned only at creation) |
| GET / DELETE | `/config/ai/apikey/{key_id}` | Get / delete one key |
| POST | `/config/ai/tenant/ratelimit` | Set tenant rate limit (rps, tokens/min) |
| GET | `/config/ai/tenant/ratelimit/{tenant_id}` | Get tenant rate limit |
| POST | `/config/gpu/enable` \| `/config/gpu/disable` | Toggle GPU-aware routing (`sel: 9`) |
| GET | `/config/gpu/status` | GPU monitoring state |
| POST | `/config/gpu/conversations/cleanup` | Prune stale conversation affinity |
| POST / GET | `/config/worker/metrics` | Push / read per-worker GPU metrics (queue depth, KV-cache usage) |
| GET | `/config/trace/parsers`, `/config/trace/catalog/{catalog_id}/parser` | Trace parsers and per-catalog parser assignment (`/config/trace/catalogs` list not yet implemented, returns 501) |
| GET / POST / DELETE | `/config/opa/watcher` | OPA L4 policy watcher |
| GET / POST / DELETE | `/sni/certificates` | TLS/SNI certificate management |

API-key auth and tenant rate limits are control-plane CRUD; per the docs, request-path enforcement is documented as roadmap — verify behavior on your build before relying on 401/403/429 in the data path.

---

## Common Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid field, malformed body) |
| 401 | Missing/invalid bearer token (when auth is enabled) |
| 404 | Resource not found |
| 409 | Resource already exists / conflict |
| 500 | Internal error (e.g. datapath update failed) |
| 503 | Unavailable (e.g. `/metrics` before `POST /config/metrics`) |

**Error schema:** `{ "code": 400, "sub-code": 0, "message": "...", "fields": [...], "details": "...", "result": "..." }`

---

## CLI Tool (loxicmd)

`loxicmd` mirrors the REST API, including AI-aware subcommands (`apikey`, `ratelimit`, `metrics`, `gpu`, `opa`, `sni`, KV inventory):

```bash
loxicmd get lb                    # list LB rules
loxicmd get endpoint              # endpoint health
loxicmd get conntrack             # active connections
loxicmd get bgpneigh              # BGP neighbors
loxicmd create lb 192.168.1.100 --tcp=80:8080 --endpoints=10.0.1.5:1 --mode=fullnat
loxicmd create lb 10.10.10.254 --tcp=8080:8000 --endpoints=31.31.31.1:1 \
  --select=chwbl --mode=fullproxy --host=10.10.10.254   # AI/L7 rule
loxicmd delete lb 192.168.1.100 --tcp=80
```

**Repository:** github.com/loxilb-io/loxicmd (release binaries on the GitHub releases page).

---

## Further Reading

- **Architecture:** `architecture.md`
- **Features (incl. AI fields):** `features.md`
- **Configuration Patterns:** `configuration-patterns.md`
- **Troubleshooting:** `troubleshooting.md`
- **Swagger spec:** `swagger_new.yml` in the loxitui repository (authoritative field-level contract)
