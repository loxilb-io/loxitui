# MCP Server Mode

loxitui can run as a [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
stdio server, exposing 16 read-only LoxiLB inspection tools to any MCP client — Claude
Code, Claude Desktop, or your own automation. This page is for operators wiring loxitui
into an AI/automation stack; see the [AI sidebar guide](ai-sidebar.md) for the built-in
assistant that uses this server automatically.

## Starting the Server

```bash
loxitui --mcp-server
```

The server (`src/mcp/server.ts`, dispatched from `src/cli.tsx`) speaks MCP over
**stdin/stdout** — it opens no network port. It is designed to be spawned as a child
process by an MCP client. LoxiLB connection parameters come from environment variables
set by the parent process:

| Variable | Default | Meaning |
|---|---|---|
| `LOXILB_HOST` | `127.0.0.1` | LoxiLB API host |
| `LOXILB_PORT` | `11111` | LoxiLB API port |
| `LOXILB_TLS` | `false` | Set to `true` for HTTPS |
| `LOXILB_TOKEN` | (empty) | Bearer token for the LoxiLB API |
| `LOXILB_AUDIT_LOG_PATH` | (empty) | NDJSON audit file to append tool-call events to (optional) |
| `LOXILB_AUDIT_SESSION_ID` | `00000000` | Session ID to stamp on audit events (optional) |

You normally never start it by hand: when the AI sidebar uses the `claude-cli`
provider, loxitui writes a temporary MCP config and the Claude CLI spawns
`loxitui --mcp-server` itself, passing connection and audit context through these
variables (`src/ai/provider/claude-cli.ts`).

## Tool Catalog

All tools are defined once in `src/ai/tools.ts` (`REGISTERED_TOOLS`) and bridged to MCP
by `src/mcp/server.ts` — the sidebar and the MCP server always expose the identical
set. Every tool is **read-only**: none of them create, modify, or delete configuration.

| Tool | Parameters | Returns |
|---|---|---|
| `get_logs` | `count` (default 50, max 200) | Recent LoxiLB log lines |
| `get_lb_services` | — | All LB service rules with VIPs, backends, health status |
| `get_endpoints` | — | Endpoint health probes with status and delay metrics |
| `get_conntrack` | `limit` (default 100, max 500) | Active connection-tracking entries (live flows) |
| `get_routes` | — | Routing table entries (destination, gateway, interface) |
| `get_cluster_state` | — | HA cluster instance roles and VIP assignments |
| `get_ports` | — | Network interfaces with MAC, MTU, link state |
| `get_system_status` | — | Host/OS/kernel/uptime plus top processes |
| `get_version` | — | LoxiLB version and build info |
| `get_bgp_neighbors` | — | BGP sessions: peer IP, AS number, state, uptime |
| `get_metrics_summary` | — | Flow count, error count, processed traffic volume |
| `get_firewall_rules` | — | Firewall rules with source/destination/protocol/action |
| `get_trace_status` | — | HTTP and L4 trace enabled/disabled state |
| `get_worker_metrics` | — | GPU metrics for tracked inference workers (queue depth, KV-cache usage) and GPU-aware routing state |
| `get_ai_gateway_status` | — | AI-gateway status: GPU-aware routing state and statistics |
| `get_opa_watcher` | — | OPA L4 policy watcher status: server, sync state, active rule count, circuit breaker |

When registered under the server name `loxilb` (as the sidebar does), the fully
qualified tool names are `mcp__loxilb__get_lb_services`, `mcp__loxilb__get_logs`, and
so on (`src/ai/system-prompt.ts`).

Results are cached in memory for **5 seconds** per (tool, arguments) pair, so a model
that calls the same tool twice in one turn doesn't hit the LoxiLB API twice; the TTL is
deliberately short so operators always see fresh data.

## Registering With an MCP Client

### Claude Code

```bash
claude mcp add loxilb \
  --env LOXILB_HOST=10.0.0.5 \
  --env LOXILB_PORT=11111 \
  --env LOXILB_TLS=false \
  --env LOXILB_TOKEN=CHANGE_ME \
  -- loxitui --mcp-server
```

Then ask questions in Claude Code — e.g. "using the loxilb tools, list unhealthy
endpoints" — and it will call the tools directly.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "loxilb": {
      "command": "loxitui",
      "args": ["--mcp-server"],
      "env": {
        "LOXILB_HOST": "10.0.0.5",
        "LOXILB_PORT": "11111",
        "LOXILB_TLS": "false",
        "LOXILB_TOKEN": "CHANGE_ME"
      }
    }
  }
}
```

Use the full path to the `loxitui` binary if it is not on the client's `PATH`.

## Audit Logging

If `LOXILB_AUDIT_LOG_PATH` is set, the server appends one NDJSON record per tool
invocation to the shared audit file:

- `ai.tool_call` — tool name plus a summary of the arguments (and a `cached: true`
  marker when served from the 5-second cache)
- `ai.tool_result` — `ok` or `error` status with latency in milliseconds

Records carry the session ID from `LOXILB_AUDIT_SESSION_ID`, so tool calls made by the
Claude CLI subprocess correlate with the parent TUI session in a single audit trail.
The MCP server writes these records with a direct file append and never touches
stdout — stdout is reserved for the MCP transport. Event shapes are defined in
`src/audit/types.ts`; validated by: `tests/audit.test.ts`.

## Security Notes

- **The server acts with the credentials you give it.** Whatever `LOXILB_TOKEN` can
  read via the LoxiLB API, any connected MCP client (and any model driving it) can
  read too. Use a token scoped to read access where your deployment supports it, and
  treat client configs containing the token as secrets.
- **Tools are read-only by construction** — the registry contains only `get_*` tools,
  and nothing in `src/mcp/server.ts` exposes create/update/delete operations. Adding a
  mutating tool would be a significant policy change; see the guarantees in
  [CONTRIBUTING.md](../CONTRIBUTING.md) before proposing one.
- **No network listener.** Transport is stdio only; exposure is limited to whoever can
  spawn the process with your environment variables.
- **Returned data can be sensitive.** Connection tables, logs, and firewall rules
  reveal internal topology. If the MCP client is a hosted model (e.g. Claude via the
  Claude CLI), tool results are sent to that model as conversation context — use the
  `ollama` sidebar provider or a local MCP client if data must stay on-host.
- Diagnostic output goes to **stderr** only; a stray `console.log` would corrupt the
  MCP protocol stream, which is why the server writes audit records directly with
  file appends.

## Related Documentation

- [README](../README.md) — features, installation, quick start
- [AI sidebar](ai-sidebar.md) — the built-in assistant that consumes this server
- [Developer guide](developer-guide.md) — architecture and module map
