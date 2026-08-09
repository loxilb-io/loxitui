# loxitui User Guide

This guide covers installing, configuring, and operating **loxitui**, the terminal user interface for [LoxiLB](https://github.com/loxilb-io/loxilb) and the LoxiLB inference gateway. It is written for cloud and network infrastructure operators who manage LoxiLB instances from the command line.

Related documentation: [README](../README.md) · [Keyboard Reference](keyboard-reference.md) · [YAML Configuration Management](yaml-config.md) · [AI Sidebar](ai-sidebar.md) · [MCP Server](mcp-server.md) · [Developer Guide](developer-guide.md)

---

## Table of Contents

1. [Installation](#1-installation)
2. [First Run](#2-first-run)
3. [Connecting to LoxiLB](#3-connecting-to-loxilb)
4. [CLI Subcommands](#4-cli-subcommands)
5. [Panels Overview](#5-panels-overview)
6. [AI Assistant (Optional)](#6-ai-assistant-optional)
7. [Configuration File Reference](#7-configuration-file-reference)
8. [Environment Variables](#8-environment-variables)
9. [Audit Log](#9-audit-log)

---

## 1. Installation

### 1.1 Release tarballs (recommended)

Pre-built binaries for Linux and macOS (x64 and arm64) are published on
[GitHub Releases](https://github.com/loxilb-io/loxitui-inference-gateway/releases).
Assets are versioned — download the tarball for your platform from the release
page (example below uses Linux x64; substitute the release version):

```bash
# Download the tarball for your platform
VERSION=0.1.0-rc.1
curl -LO https://github.com/loxilb-io/loxitui-inference-gateway/releases/download/v${VERSION}/loxitui-${VERSION}-linux-x64.tar.gz

# Extract and install the binary onto your PATH
tar -xzf loxitui-${VERSION}-linux-x64.tar.gz
mkdir -p ~/.local/bin
install -m 0755 loxitui-${VERSION}-linux-x64/loxitui ~/.local/bin/loxitui

# Verify
loxitui version
```

Available platform builds: `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64`. Every release ships `SHA256SUMS`, an SPDX SBOM, and SLSA
build-provenance attestations.

### 1.2 Docker

Multi-arch container images are published to GitHub Container Registry:

```bash
# Run interactively
docker run -it --rm ghcr.io/loxilb-io/loxitui-inference-gateway

# Persist configuration between runs (the container's HOME is /tmp)
docker run -it --rm \
  -v loxitui-config:/tmp/.config \
  ghcr.io/loxilb-io/loxitui-inference-gateway
```

Notes:

- The image runs as a non-root user with `HOME=/tmp`, so the config file lives
  at `/tmp/.config/loxitui/config.toml` inside the container. Mount a volume at
  `/tmp/.config` (as shown above) to keep it across runs.
- Add `--network host` (Linux) if your LoxiLB API is bound to the host, or pass
  a reachable host name during `loxitui setup`.
- Subcommands work as usual: `docker run -it --rm ghcr.io/loxilb-io/loxitui-inference-gateway doctor`.

### 1.3 Build from source

Requires [Bun](https://bun.sh) **1.3.6 or newer**.

```bash
git clone https://github.com/loxilb-io/loxitui-inference-gateway.git
cd loxitui-inference-gateway
bun install

# Build for the current platform
make build            # -> bin/loxitui

# Or build all platform binaries
make build-all        # -> dist/loxitui-{linux,darwin}-{amd64,arm64}

# Install to ~/.local/bin
make install-user

# Run the test suite and type-checker
make test
make typecheck
```

---

## 2. First Run

Run the interactive setup wizard once to create the config file:

```bash
loxitui setup
```

The wizard prompts for:

| Prompt | Default | Notes |
|---|---|---|
| LoxiLB host | `127.0.0.1` | Hostname or IP of the LoxiLB API |
| LoxiLB port | `11111` | LoxiLB REST API port |
| Use TLS? | `no` | `y`/`n` — use HTTPS to reach the API |
| LoxiLB API token | *(empty)* | Optional bearer token; leave blank to skip |
| AI provider | `claude-cli` | `claude-cli` or `ollama` — see [AI Assistant](#6-ai-assistant-optional) |
| Ollama base URL | `http://localhost:11434` | Asked only when provider is `ollama` |
| Ollama model | `llama3.2` | Asked only when provider is `ollama` |

The answers are written to `~/.config/loxitui/config.toml`. Then:

```bash
# Verify connectivity and configuration
loxitui doctor

# Launch the TUI
loxitui
```

The AI provider is **optional** — if you skip installing one, every monitoring
panel, CRUD form, and CLI subcommand still works. Only the AI sidebar and the
`ask` subcommand require a provider.

---

## 3. Connecting to LoxiLB

The connection is defined by the `[loxilb]` section of the config file:

```toml
[loxilb]
host  = "192.168.10.5"   # LoxiLB API host
port  = 11111            # LoxiLB API port
tls   = false            # true = HTTPS, false = HTTP
token = ""               # optional bearer token for authenticated APIs
```

Use `loxitui doctor` to test the connection:

```console
$ loxitui doctor

loxitui doctor

  Config file          [OK]  Loaded successfully
  LoxiLB API           [OK]  Connected to 192.168.10.5:11111
  AI provider          [OK]  claude CLI 2.x.x (Claude Code)

  All checks passed!
```

`doctor` exits `0` when the LoxiLB API is reachable and `1` otherwise. A
failing AI provider check does **not** affect the exit code — the AI assistant
is optional.

For a quick machine-readable health snapshot without launching the TUI:

```bash
loxitui status                  # human-readable summary
loxitui status --output json    # JSON (services, endpoints, conntrack, cluster, routes)
```

---

## 4. CLI Subcommands

```
loxitui [command]
```

| Command | Description |
|---|---|
| *(none)* | Launch the interactive TUI (default) |
| `setup` | Interactive configuration wizard; writes `~/.config/loxitui/config.toml` |
| `doctor` | Check config, LoxiLB API connectivity, and AI provider availability |
| `status` | Print live LoxiLB state. `--output json` (or `-o json`) for machine-readable output |
| `ask "<question>"` | Ask the AI assistant a question headlessly (streams the answer to stdout). Requires an AI provider |
| `yaml` | Declarative YAML configuration management — see [yaml-config.md](yaml-config.md) |
| `version` (`--version`, `-v`) | Print version and exit |
| `help` (`--help`, `-h`) | Print usage help |

Advanced: `loxitui --mcp-server` starts the built-in MCP (Model Context
Protocol) stdio tool server that exposes read-only LoxiLB query tools. You
normally never run this yourself — when you send an AI message, loxitui spawns
it automatically as a subprocess.

Exit codes worth knowing for scripting:

| Command | Exit codes |
|---|---|
| `doctor` | `0` API reachable, `1` unreachable |
| `status` | `0` success, `1` LoxiLB unreachable |
| `ask` | `0` success, `2` provider stream error, `3` provider validation failed (e.g. CLI not installed) |
| `yaml *` | See [yaml-config.md](yaml-config.md#3-subcommand-reference) |

Validated by: `tests/cmd.test.ts`

---

## 5. Panels Overview

The TUI organizes 32 monitoring panels into seven tab groups. Switch groups
with `[` / `]`, move between panels with `Tab` / arrow keys, and jump straight
to the most-used panels with number keys `1`–`9`. See the full
[Keyboard Reference](keyboard-reference.md).

| Group | Panels |
|---|---|
| **OVERVIEW** | Dashboard, LB Services, Endpoints, Metrics, Logs |
| **NET** | ConnTrack, Routes, Cluster, Trace, Ports |
| **SEC** | Firewall, IP Filter, Rate Limit, SNI, CORS |
| **BGP** | BGP Neighbors, BGP Policy, BFD |
| **L2** | VLAN, VxLAN, Session, L2 Policy, Mirror, IPv4 Addr, ARP Neighbors, FDB |
| **IPSEC** | IPSec Tunnels, IPSec SAs, IPSec Stats, IPSec Certs |
| **AI** | GPU, Trace Parsers |

Highlights:

- **Dashboard** — system info (hostname, OS, kernel, uptime), resource counts,
  port statistics, disk utilisation, and LoxiLB process details (CPU, MEM, RSS).
- **LB Services** — the load-balancer rule table. Press `n` to create a
  service, `d` to delete the selected one.
- **Routes** — static routes; also supports `n` (create) and `d` (delete).
- **Logs** — real-time log viewer fetched from the LoxiLB `/logs` API (no SSH
  or file access needed), with severity colouring, paging, and search.
- **Trace** — HTTP and L4 trace flags; press `Enter` to toggle the selected flag.
- **Metrics** — KPI summary row plus Prometheus sparkline charts (requires
  `[metrics]` polling to be enabled).
- **AI group panels** — inference-gateway observability: GPU state and trace
  parsers. These panels show live LoxiLB data and do **not** require an AI
  provider.

Most list panels support incremental search: press `Ctrl+F`, type a filter,
and press `Esc` to close it.

---

## 6. AI Assistant (Optional)

The AI sidebar (`Ctrl+G`) and the `ask` subcommand let you query your LoxiLB
instance in natural language. **This feature is optional** — it requires an AI
provider, and everything else in loxitui works without one.

Two providers are supported:

| Provider | Requirements | Notes |
|---|---|---|
| `claude-cli` (default) | [Claude CLI (Claude Code)](https://docs.anthropic.com/en/docs/claude-code) installed and logged in | No API key stored in loxitui; the assistant can autonomously query live LoxiLB data through MCP tools |
| `ollama` | A reachable [Ollama](https://ollama.com) server | Fully local; set `base_url` and `model` in `[ai]` |

```bash
# Claude CLI setup (one-time)
npm install -g @anthropic-ai/claude-code
claude login

# Select the provider
loxitui setup          # choose claude-cli or ollama

# Verify
loxitui doctor

# Headless one-shot question
loxitui ask "Why are my endpoints showing DOWN?"
```

When you send a message with the `claude-cli` provider, loxitui automatically
spawns its MCP tool server as a subprocess so the assistant can fetch live
LB, endpoint, conntrack, and cluster data — you do not need to run
`--mcp-server` yourself.

---

## 7. Configuration File Reference

Location: `~/.config/loxitui/config.toml` (created by `loxitui setup`).

Configuration is resolved in this order (later wins):

1. Built-in defaults
2. Global config: `~/.config/loxitui/config.toml`
3. Project config: `./.loxitui/config.toml` (relative to the current directory)
4. `LOXILB_CONFIG_PATH` — when set, this file **replaces** the global config
   and the project config is ignored

Full annotated example with defaults:

```toml
[loxilb]
host     = "127.0.0.1"    # LoxiLB API host
port     = 11111          # 1-65535
tls      = false          # true = HTTPS
token    = ""             # optional static bearer token
username = ""             # optional JWT login — exchanged for a token via /auth/login
password = ""             # optional JWT login password (used with username)

[ai]
provider          = "claude-cli"  # "claude-cli" (default) or "ollama"
api_key           = ""            # reserved for providers that need a key; unused by claude-cli/ollama
model             = "claude-3-5-sonnet-20241022"  # claude-cli manages its own model; ollama e.g. "llama3.2"
base_url          = ""            # Ollama base URL override (default http://localhost:11434)
knowledge_base_path = ""          # override path to the bundled LoxiLB knowledge base
max_history_turns = 20            # 1-100 — conversation turns kept in context
summary_threshold = 0.7           # 0.1-1.0 — context-window fraction that triggers auto-summarisation

[metrics]
enabled         = true   # enable Prometheus polling
poll_interval_s = 30     # 5-300 seconds between scrapes
history_points  = 60     # 10-1000 data points retained per metric (ring buffer)

[ui]
refresh_interval_ms = 5000        # >= 1000 — panel auto-refresh interval
default_panel       = "dashboard" # one of: dashboard, lb, endpoints, conntrack,
                                  #         routes, cluster, trace, metrics, logs
sidebar_width_pct   = 30          # 15-50 — AI sidebar width as % of terminal width

[logs]
log_path  = ""   # local log file path (legacy; the Log panel fetches via API)
max_lines = 50   # 1-10000 — maximum log lines kept per fetch

[audit]
enabled     = true
log_path    = "~/.local/share/loxitui/audit.log"  # "~" is expanded
stderr      = false   # mirror audit records to stderr
max_size_mb = 50      # 1-1024 — rotate when the log exceeds this size
max_files   = 5       # 1-20 — rotated files to keep

# Top-level log paths (not under [logs]) used for AI log analysis context
log_path    = "/var/log/loxilb.log"     # LoxiLB control-plane log
log_path_dp = "/var/log/loxilbdp.log"   # LoxiLB data-plane log
```

Field reference:

| Section | Field | Type | Default | Constraints |
|---|---|---|---|---|
| `[loxilb]` | `host` | string | `"127.0.0.1"` | non-empty |
| `[loxilb]` | `port` | int | `11111` | 1–65535 |
| `[loxilb]` | `tls` | bool | `false` | |
| `[loxilb]` | `token` | string | `""` | static bearer token; leave empty when using `username`/`password` |
| `[loxilb]` | `username` | string | `""` | optional JWT login user — exchanged for a token via `/auth/login` |
| `[loxilb]` | `password` | string | `""` | optional JWT login password |
| `[ai]` | `api_key` | string | `""` | |
| `[ai]` | `model` | string | `"claude-3-5-sonnet-20241022"` | non-empty when set explicitly; `setup` writes `"sonnet"` for claude-cli |
| `[ai]` | `provider` | string | `"claude-cli"` | `claude-cli` or `ollama` |
| `[ai]` | `base_url` | string | `""` | |
| `[ai]` | `knowledge_base_path` | string | `""` | |
| `[ai]` | `max_history_turns` | int | `20` | 1–100 |
| `[ai]` | `summary_threshold` | float | `0.7` | 0.1–1.0 |
| `[metrics]` | `enabled` | bool | `true` | |
| `[metrics]` | `poll_interval_s` | int | `30` | 5–300 |
| `[metrics]` | `history_points` | int | `60` | 10–1000 |
| `[ui]` | `refresh_interval_ms` | int | `5000` | ≥ 1000 |
| `[ui]` | `default_panel` | string | `"dashboard"` | `dashboard`, `lb`, `endpoints`, `conntrack`, `routes`, `cluster`, `trace`, `metrics`, `logs` |
| `[ui]` | `sidebar_width_pct` | int | `30` | 15–50 |
| `[logs]` | `log_path` | string | `""` | |
| `[logs]` | `max_lines` | int | `50` | 1–10000 |
| `[audit]` | `enabled` | bool | `true` | |
| `[audit]` | `log_path` | string | `"~/.local/share/loxitui/audit.log"` | `~/` expanded |
| `[audit]` | `stderr` | bool | `false` | |
| `[audit]` | `max_size_mb` | int | `50` | 1–1024 |
| `[audit]` | `max_files` | int | `5` | 1–20 |
| *(top level)* | `log_path` | string | `"/var/log/loxilb.log"` | |
| *(top level)* | `log_path_dp` | string | `"/var/log/loxilbdp.log"` | |

Validated by: `tests/config.test.ts`

---

## 8. Environment Variables

| Variable | Description |
|---|---|
| `LOXILB_CONFIG_PATH` | Path to an alternative `config.toml`. When set, it replaces `~/.config/loxitui/config.toml` and the project-level `./.loxitui/config.toml` is ignored |
| `LOXILB_KNOWLEDGE_PATH` | Override the path to the bundled `loxilb-knowledge/` directory used by the AI assistant |
| `LOXILB_SKILLS_PATH` | Override the path to the AI skill files directory |
| `LOXILB_LOG_PATH` | *(deprecated)* Previously pointed the Log panel at a local file; logs are now fetched via the LoxiLB `/logs` API |
| `XDG_DATA_HOME` | Honoured when locating the installed knowledge base (`$XDG_DATA_HOME/loxitui/loxilb-knowledge`) |

The following variables are consumed by the MCP tool server process
(`loxitui --mcp-server`). loxitui sets them automatically when it spawns the
server for the AI assistant; you only need them when running the MCP server
standalone:

| Variable | Description |
|---|---|
| `LOXILB_HOST` | LoxiLB API host (default `127.0.0.1`) |
| `LOXILB_PORT` | LoxiLB API port (default `11111`) |
| `LOXILB_TLS` | `true` to use HTTPS |
| `LOXILB_TOKEN` | Bearer token for the LoxiLB API |
| `LOXILB_AUDIT_LOG_PATH` | Audit log file the MCP server appends tool-call records to |
| `LOXILB_AUDIT_SESSION_ID` | Session ID correlating MCP records with the parent TUI session |

---

## 9. Audit Log

loxitui writes a structured audit trail of operator actions, AI queries, API
calls, and application lifecycle events.

- **Location**: `~/.local/share/loxitui/audit.log` (configurable via
  `[audit] log_path`)
- **Format**: NDJSON — one JSON object per line
- **Rotation**: automatic, controlled by `[audit] max_size_mb` and `max_files`
- **Redaction**: API tokens are never written in clear text (recorded as
  `"[REDACTED]"`)

Each record carries at least:

| Field | Meaning |
|---|---|
| `ts` | ISO 8601 timestamp |
| `level` | `INFO`, `WARN`, or `ERROR` |
| `session` | Short session ID correlating all records of one run |
| `event` | Event name (see families below) |
| `component` | Emitting component (`app`, `tui`, `cmd`, `api`, `ai`, ...) |
| `data` | Event-specific payload |

Event families:

| Prefix | Examples | Covers |
|---|---|---|
| `app.*` | `app.startup`, `app.shutdown`, `app.error` | Process lifecycle |
| `tui.*` | `tui.action`, `tui.error` | Panel switches, forms, deletes, sidebar toggles |
| `cmd.*` | `cmd.dispatch` | CLI subcommand invocations |
| `api.*` | `api.request` | LoxiLB REST calls |
| `ai.*` | `ai.query`, `ai.response`, `ai.tool_call`, `ai.tool_result`, `ai.error` | AI assistant activity (only present when an AI provider is used) |

Inspect it live:

```bash
tail -f ~/.local/share/loxitui/audit.log | jq .
```

Validated by: `tests/audit.test.ts`

---

Next: learn the keys in the [Keyboard Reference](keyboard-reference.md), or
manage configuration declaratively with
[YAML Configuration Management](yaml-config.md).
