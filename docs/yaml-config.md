# Declarative YAML Configuration Management

`loxitui yaml` manages your entire LoxiLB configuration as version-controlled
YAML files — the same declarative, GitOps-style workflow as Kubernetes:
describe the desired state in YAML, preview the diff against the live
instance, apply it, and roll back if needed. This guide is written for
infrastructure operators; it assumes loxitui is installed and connected to a
LoxiLB instance (see the [User Guide](user-guide.md)).

---

## Table of Contents

1. [Concepts](#1-concepts)
2. [Directory layout — `loxitui yaml init`](#2-directory-layout--loxitui-yaml-init)
3. [Subcommand reference](#3-subcommand-reference)
4. [Workflows](#4-workflows)
5. [Schema validation](#5-schema-validation)
6. [Variable substitution](#6-variable-substitution)
7. [Snapshots and versioning](#7-snapshots-and-versioning)
8. [CI/CD integration — `--format json`](#8-cicd-integration----format-json)

---

## 1. Concepts

Every LoxiLB resource is expressed as a YAML document with the familiar
`apiVersion` / `kind` / `metadata` / `spec` structure:

```yaml
apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: nginx-https-lb
spec:
  externalIP: "10.0.0.1"
  port: 443
  protocol: https
  mode: fullproxy
  endpoints:
    - endpointIP: "192.168.1.10"
      targetPort: 8080
```

- Multiple documents may live in one file, separated by `---`.
- `metadata.name` is a human-readable label; the resource's real identity on
  the LoxiLB side is derived from its identity fields (e.g. a LoadBalancer is
  identified by `externalIP` + `port` + `protocol`).
- Files can be organized freely — every subcommand accepts either a single
  `.yaml`/`.yml` file or a directory, which is scanned recursively.

All **34 configurable LoxiLB resource kinds** are supported, organized into
eight domain groups (`EndpointHostState` also appears in exports but is
operational/read-only — it cannot be applied):

| Domain group | Kinds |
|---|---|
| `core` | `LoadBalancer`, `Endpoint`, `Session` (plus read-only `EndpointHostState`) |
| `network` | `Route`, `IPv4Address`, `IPv6Address`, `Neighbor`, `Fdb`, `Vlan`, `VlanMember`, `VxlanTunnel`, `VxlanPeer` |
| `security` | `Firewall`, `IpFilter`, `SecurityRate` |
| `bgp` | `BgpGlobal`, `BgpNeighbor`, `BgpPolicyDefinedSet`, `BgpPolicyDefinition`, `BgpPolicyApply` |
| `ipsec` | `IpsecConfig`, `IpsecTunnel`, `IpsecCertificate`, `IpsecCaCertificate` |
| `observability` | `Bfd`, `Policy`, `Mirror` |
| `ai-gateway` | `AiApiKey`, `AiTenantRateLimit` |
| `system` | `Params`, `Cors`, `SniCertificate`, `Cert`, `OpaWatcher` |

Validated by: `tests/yaml/registry.test.ts`, `tests/yaml/parser.test.ts`

## 2. Directory layout — `loxitui yaml init`

```bash
loxitui yaml init [path] [--force]
```

Scaffolds a conventional config directory (default: `./loxilb-config`). Each
subdirectory gets a `README.md` describing what belongs there:

```
loxilb-config/
├── env/            # Environment-specific values files (values-dev.yaml, values-prod.yaml)
├── core/           # Load balancers, endpoints, sessions
├── network/        # Routes, IPv4 addresses, neighbors, FDB, VLANs, VxLAN tunnels
├── security/       # Firewalls, IP filters, security rate limits
├── bgp/            # BGP global config, neighbors, policy sets, definitions
├── ipsec/          # IPsec tunnels, certificates, CA certificates, configs
├── ai-gateway/     # AI API keys, tenant rate limits
├── observability/  # BFD, policies, mirrors
└── system/         # Params, CORS, SNI certificates, OPA watchers
```

| Flag | Description |
|---|---|
| `path` | Target directory (default `./loxilb-config`) |
| `--force` | Initialize even if the directory is not empty |
| `--help` | Show help |

The layout is a convention, not a requirement — `validate`, `diff`, and
`apply` walk any directory recursively and identify resources by their `kind`,
not by their location.

Validated by: `tests/yaml/cli/init.test.ts`

## 3. Subcommand reference

```
loxitui yaml <subcommand> [options]
```

| Subcommand | Description |
|---|---|
| `init` | Create a new config directory structure |
| `validate` | Validate YAML files against schema and semantic rules |
| `apply` | Apply YAML configuration to the live LoxiLB instance |
| `diff` | Show differences between YAML and live state |
| `export` | Export live configuration as YAML files |
| `history` | List configuration revision history |
| `rollback` | Roll back to a previous configuration revision |
| `help` | Show help (`loxitui yaml --help`, or `<subcommand> --help` for flags) |

Global option (works with every subcommand): `--format json` — emit a
machine-readable JSON envelope instead of human-readable text (see
[CI/CD integration](#8-cicd-integration----format-json)).

### `yaml validate <path> [--schema-only]`

Validates files without touching the live instance.

| Flag | Description |
|---|---|
| `<path>` | A `.yaml`/`.yml` file or a directory (recursive) |
| `--schema-only` | Run only JSON Schema validation, skip semantic rules |

Exit codes: `0` all resources valid, `1` any failure. Each error is reported
with its field path and a suggestion for fixing it.

### `yaml diff <path> [--values <file>] [--set KEY=VALUE ...]`

Read-only comparison of the desired YAML state with the live state. Output
uses the conventional markers: `=` unchanged, `+` create, `~` update (with
per-field `live -> desired` details), `-` delete.

| Flag | Description |
|---|---|
| `<path>` | A `.yaml`/`.yml` file or a directory (recursive) |
| `--values <file>` | Values file for [variable substitution](#6-variable-substitution) |
| `--set KEY=VALUE` | Variable override (repeatable) |

Exit codes (like `diff(1)`): `0` no changes, `1` changes detected or error.

### `yaml apply <path> [--dry-run] [--yes] [--prune] [--values <file>] [--set KEY=VALUE ...]`

Validates, diffs, plans, snapshots, and applies. The execution plan is always
printed first; without `--yes` nothing is changed.

| Flag | Description |
|---|---|
| `<path>` | A `.yaml`/`.yml` file or a directory (recursive) |
| `--dry-run` | Print the execution plan and stop |
| `--yes`, `-y` | Confirm and execute the plan |
| `--prune` | Also delete live resources that are not present in the YAML |
| `--values <file>` | Values file for variable substitution |
| `--set KEY=VALUE` | Variable override (repeatable) |

Before executing, `apply` automatically creates a versioned snapshot of the
full live state (see [Snapshots](#7-snapshots-and-versioning)), so every apply
can be undone with `rollback`.

Exit codes: `0` all operations succeeded (or nothing to do / dry run), `1`
validation failure, missing `--yes`, or any failed operation.

### `yaml export [--kind <kind>] [--name <name>] [--output <dir>] [--all]`

Captures the current live configuration as domain-organized YAML files —
ideal for a first-time import of an existing instance into Git.

| Flag | Description |
|---|---|
| `--kind <kind>` | Export only the given resource kind (e.g. `LoadBalancer`) |
| `--name <name>` | Export only the resource matching the identity key |
| `--output <dir>`, `-o <dir>` | Output directory (default: current directory) |
| `--all` | Export all configurable kinds (the default behaviour) |

Files are written as `<domain-group>/<Kind>.yaml`, one file per kind with
multi-document YAML for multiple resources.

Validated by: `tests/yaml/export/exporter.test.ts`

### `yaml history [--config-dir <dir>] [--limit <n>]`

Lists revision snapshots with revision ID, timestamp, user, operation summary,
and status.

| Flag | Description |
|---|---|
| `--config-dir <dir>` | Override the `.loxilb-config` location |
| `--limit <n>` | Show only the last *n* revisions |

### `yaml rollback <rev-NNNN> [--yes] [--dry-run] [--config-dir <dir>]`

Restores the live state to a previous revision snapshot. The rollback plan is
always shown first; without `--yes` nothing is changed.

| Flag | Description |
|---|---|
| `<rev-NNNN>` | Revision ID from `yaml history` (e.g. `rev-0001`) |
| `--yes`, `-y` | Confirm and execute the rollback |
| `--dry-run` | Show the rollback plan without executing |
| `--config-dir <dir>` | Override the `.loxilb-config` location |

Validated by: `tests/yaml/versioning/rollback.test.ts`

## 4. Workflows

### Capture an existing instance, then manage it declaratively

```bash
# 1. Scaffold a config directory
loxitui yaml init ./loxilb-config

# 2. Export the current live configuration into it
loxitui yaml export --output ./loxilb-config

# 3. Put it under version control
git init loxilb-config && git -C loxilb-config add -A && git -C loxilb-config commit -m "initial LoxiLB state"

# 4. Edit YAML files with your editor of choice ...

# 5. Validate locally (no connection to LoxiLB needed)
loxitui yaml validate ./loxilb-config

# 6. Preview exactly what would change (read-only)
loxitui yaml diff ./loxilb-config

# 7. Apply — safe preview first, then for real
loxitui yaml apply ./loxilb-config --dry-run
loxitui yaml apply ./loxilb-config --yes

# 8. Inspect history and roll back if something went wrong
loxitui yaml history
loxitui yaml rollback rev-0001 --dry-run
loxitui yaml rollback rev-0001 --yes
```

### Promote one config across environments

Keep environment differences in values files and use variable substitution:

```yaml
# core/web-lb.yaml
apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: web-lb
spec:
  externalIP: "${EXTERNAL_VIP}"
  port: ${LB_PORT:-443}
  protocol: https
  endpoints:
    - endpointIP: "${BACKEND_1}"
      targetPort: ${BACKEND_PORT:-8080}
```

```yaml
# env/values-prod.yaml
EXTERNAL_VIP: "10.0.0.1"
BACKEND_1: "192.168.1.10"
```

```bash
loxitui yaml diff  ./loxilb-config --values ./loxilb-config/env/values-prod.yaml
loxitui yaml apply ./loxilb-config --values ./loxilb-config/env/values-prod.yaml --yes

# Ad-hoc override without editing any file
loxitui yaml apply ./loxilb-config \
  --values ./loxilb-config/env/values-prod.yaml \
  --set LB_PORT=8443 --yes
```

## 5. Schema validation

Validation runs in two passes:

1. **JSON Schema validation** — each resource's `spec` is checked against a
   JSON Schema **generated at build time from the LoxiLB swagger (OpenAPI)
   specification**, so the schemas always match the LoxiLB REST API: field
   names, types, ranges, and enums.
2. **Semantic rules** — cross-field checks that a plain schema cannot express
   (skipped with `--schema-only`).

Errors include the field path, the reason, and a suggestion:

```console
$ loxitui yaml validate ./loxilb-config

./loxilb-config/core/web-lb.yaml:
  ✗ LoadBalancer "web-lb":
    spec.port: must be <= 65535
    → Use a port number between 1 and 65535

1 file(s), 1 resource(s): 0 passed, 1 failed
```

`validate` is fully offline — it never contacts the LoxiLB API, so it is safe
to run in pre-commit hooks and CI.

Validated by: `tests/yaml/schema-validation.test.ts`,
`tests/yaml/schema-validator.test.ts`, `tests/yaml/semantic-validator.test.ts`,
`tests/yaml/generate-schemas.test.ts`

## 6. Variable substitution

YAML files may reference variables with shell-style syntax:

| Pattern | Meaning |
|---|---|
| `${VAR}` | Substitute the value of `VAR`; an error if `VAR` is not defined anywhere |
| `${VAR:-default}` | Substitute `VAR`, falling back to `default` when unset |

Values are resolved with this precedence (highest wins):

1. `--set KEY=VALUE` command-line overrides
2. `--values <file>` — a YAML file of flat `KEY: value` pairs
3. Process environment variables
4. The `:-default` fallback in the pattern itself

Substitution happens on the **raw file text before YAML parsing**, which
preserves scalar types: `port: ${PORT}` with `PORT=443` becomes `port: 443`
(an integer), not `port: "443"` (a string).

Any `${...}` pattern that remains unresolved after all four sources are
checked is a hard error, reported with file and line number — an apply can
never silently ship a literal `${VAR}` to the API.

Validated by: `tests/yaml/parser.test.ts`

## 7. Snapshots and versioning

Every non-dry-run `apply` first captures a **full snapshot of the live
state** — every configurable kind, exported to domain-organized YAML — under a
sequential revision directory:

```
.loxilb-config/                 # created in the current working directory
├── config.json                 # { "maxRevisions": 50 }
└── revisions/
    ├── rev-0001/
    │   ├── metadata.json       # who, when, why, planned operations
    │   ├── core/LoadBalancer.yaml
    │   ├── network/Route.yaml
    │   └── ...
    └── rev-0002/
        └── ...
```

- Revision IDs are sequential: `rev-0001`, `rev-0002`, ...
- `metadata.json` records the revision ID, ISO 8601 timestamp, system user,
  description, the planned operations (e.g. `CREATE LoadBalancer/web-lb`),
  the trigger (`pre-apply` or `manual`), the applied file path, and the list
  of kinds captured.
- Old revisions are pruned automatically; the retention limit is
  `maxRevisions` in `.loxilb-config/config.json` (default **50**).
- The snapshot directory location defaults to `./.loxilb-config` and can be
  overridden with `--config-dir` on `history` and `rollback`.

`rollback` computes the plan needed to bring the live state back to the
selected revision and — because rollback execution itself snapshots the
current state first — **a rollback can always be undone by rolling back to
the revision it created**.

```bash
loxitui yaml history --limit 5
loxitui yaml rollback rev-0004 --dry-run   # inspect the plan
loxitui yaml rollback rev-0004 --yes       # execute
```

Validated by: `tests/yaml/versioning/snapshot.test.ts`,
`tests/yaml/versioning/rollback.test.ts`

## 8. CI/CD integration — `--format json`

Every subcommand accepts `--format json` and prints a single JSON envelope on
stdout:

```json
{
  "success": true,
  "exitCode": 0,
  "command": "diff",
  "data": {
    "resources": [
      { "kind": "LoadBalancer", "name": "web-lb", "action": "UPDATE",
        "changes": { "spec.port": { "desired": 8443, "actual": 443 } } }
    ],
    "totalChanges": 1
  }
}
```

On failure the envelope carries `"success": false` and an `"errors"` array.
Exit codes are unchanged, so shell pipelines and JSON consumers can coexist:

```bash
# Gate a pipeline on config drift
if ! loxitui yaml diff ./loxilb-config --format json > drift.json; then
  echo "Drift detected:" && jq '.data.resources[] | select(.action != "UNCHANGED")' drift.json
fi

# Non-interactive apply in a deployment job
loxitui yaml validate ./loxilb-config --format json
loxitui yaml apply    ./loxilb-config --yes --format json
```

Validated by: `tests/yaml/cli/json-output.test.ts`

---

Back to the [User Guide](user-guide.md) · [Keyboard Reference](keyboard-reference.md) · [README](../README.md)
