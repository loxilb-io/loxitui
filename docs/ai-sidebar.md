# AI Sidebar (Optional)

This guide covers loxitui's optional AI assistant: the in-TUI sidebar, the headless
`loxitui ask` command, providers, the knowledge base, and skills. It is written for
operators; contributors should also read the [developer guide](developer-guide.md).

**loxitui is fully functional without any AI provider.** Every monitoring panel, CRUD
form, YAML configuration workflow, metrics chart, and log viewer works with no AI
configured — the sidebar simply reports that no provider is available, and nothing else
changes. The AI assistant is an enhancement layered on top of that default experience,
never a dependency. This page documents how to enable it if you want it.

## What You Get When Enabled

Press `Ctrl+G` in the TUI to toggle the sidebar. You can ask questions about your instance in
natural language ("why are my endpoints down?", "show me the BGP session state"), and
the assistant answers using **live data**: it calls the same read-only tool set exposed
by the [MCP server](mcp-server.md) (LB services, endpoints, conntrack, routes, cluster
state, BGP, firewall rules, logs, metrics, and more), so answers reflect your actual
instance rather than model memory.

## Providers

Two providers are supported (`src/ai/provider/registry.ts`):

| Provider | Runs | Setup | Notes |
|---|---|---|---|
| `claude-cli` (default) | Anthropic API via the Claude CLI | Install the `claude` binary and authenticate it **separately** (`claude login` or equivalent). loxitui stores no API key. | loxitui spawns `claude` per query and automatically wires up its MCP tool server, so the model can fetch live LoxiLB state. |
| `ollama` | Fully local | Run [Ollama](https://ollama.com) and pull a model (e.g. `ollama pull llama3.1:8b`). | Streams over the local `/api/chat` endpoint. No data leaves your machine. Tool calling is not wired for Ollama — answers use the injected live-state context instead. |

Check provider health at any time:

```bash
loxitui doctor    # reports AI provider status as a warning, never a failure
```

## Configuration

The `[ai]` section of `~/.config/loxitui/config.toml` (fields validated by
`src/config/schema.ts`; run `loxitui setup` to generate the file interactively):

```toml
[ai]
provider          = "claude-cli"   # "claude-cli" (default) or "ollama"
model             = "claude-3-5-sonnet-20241022"  # ollama model name; claude-cli manages its own model
base_url          = ""             # ollama endpoint, default http://localhost:11434
max_history_turns = 20             # conversation turns kept in context (1-100)
summary_threshold = 0.7            # fraction of context window that triggers auto-summarization
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | `claude-cli` | Which provider to use. Unrecognized values fall back to `claude-cli`. |
| `model` | `claude-3-5-sonnet-20241022` | Model name. Used by `ollama`; the Claude CLI selects its own model. |
| `base_url` | `""` | Ollama base URL override (empty means `http://localhost:11434`). Ignored by `claude-cli`. |
| `api_key` | `""` | Reserved for future API-based providers. Neither `claude-cli` nor `ollama` needs one. |
| `knowledge_base_path` | `""` | Reserved. Use the `LOXILB_KNOWLEDGE_PATH` environment variable to relocate the knowledge base (see below). |
| `max_history_turns` | `20` | How many prior turns are sent with each query. |
| `summary_threshold` | `0.7` | When estimated context usage crosses this fraction, older history is compressed into a summary (the sidebar shows a banner and the `ai.compression` audit event is emitted). |

Validated by: `tests/config.test.ts` (schema defaults and bounds),
`tests/integration.test.ts` ("Provider registry integration").

## Knowledge Base

loxitui ships a curated LoxiLB documentation corpus in `loxilb-knowledge/`
(architecture, kubernetes-integration, troubleshooting, ha-clustering, and more). At
query time, `src/ai/knowledge-matcher.ts` extracts keywords from your question, scores
the docs, and injects the best matches into the system prompt — so answers are grounded
in LoxiLB documentation even for models that know little about LoxiLB.

The directory is located by `src/knowledge/resolve.ts`, which searches in order and
uses the first hit:

1. `LOXILB_KNOWLEDGE_PATH` environment variable (explicit override)
2. Next to the running script/binary (also one and two levels up)
3. `./loxilb-knowledge` under the current working directory (and one level up)
4. `$XDG_DATA_HOME/loxitui/loxilb-knowledge` (default `~/.local/share/loxitui/loxilb-knowledge`)

If no directory is found, retrieval quietly returns nothing and the assistant still
works — just without documentation grounding.

```bash
LOXILB_KNOWLEDGE_PATH=/opt/loxitui/loxilb-knowledge loxitui
```

Validated by: `tests/knowledge-matcher.test.ts`.

## Skills

Skills are markdown system prompts that specialize the assistant for a topic
(`src/ai/skills.ts`). A built-in general-operations skill is always present; additional
`.md` skill files are loaded from the first existing directory among
`LOXILB_SKILLS_PATH`, `claude-agents/agents/` next to the binary, or
`claude-agents/agents/` under the current working directory.

Routing is automatic: a weighted keyword matcher scores your query against each skill's
trigger vocabulary (eBPF, Kubernetes, protocols, troubleshooting, BGP/networking); if no
keyword clears the confidence threshold, a lightweight LLM classifier picks the skill,
and on any failure the default skill is used. You can also force a skill with a slash
command in the sidebar:

```text
/k8s How do I configure service annotations?
/ebpf why are packets dropped in fullnat mode?
/bgp   /debug   /proto   /cli      (/help lists them all)
```

Every routing decision is recorded in the audit log (`ai.skill_selected`, including the
matched keywords, confidence score, and whether the choice came from a keyword, the LLM
classifier, or a slash command).

## Headless Usage: `loxitui ask`

Ask one-shot questions without opening the TUI (`src/commands/ask.ts`):

```bash
loxitui ask "why are my endpoints down?"
loxitui ask "summarize current LB services and their health"
```

The answer streams to stdout. Exit codes: `0` success, `1` usage/config error,
`2` provider stream error, `3` provider validation failed (e.g. `claude` not in PATH,
Ollama unreachable) — the reason is printed to stderr.

## Behavior With No Provider (Degradation)

There is no hard failure mode:

- The TUI starts and runs normally; no AI code is exercised until you open the sidebar.
- On first open, the sidebar validates the configured provider
  (`src/tui/sidebar/AiSidebar.tsx` calling `provider.validate()`). If validation fails,
  a persistent error banner appears at the top of the sidebar with an actionable
  message, e.g. `claude CLI not found in PATH. Install from
  https://docs.anthropic.com/en/docs/claude-code` or `Ollama not reachable at
  http://localhost:11434. Is it running?`. The rest of the TUI is unaffected.
- `loxitui doctor` reports the provider check as a warning; it never affects the
  doctor exit code.
- `loxitui ask` exits with code `3` and the same message on stderr.

## Audit Logging of AI Events

When the audit log is enabled (default: `~/.local/share/loxitui/audit.log`, NDJSON),
every AI interaction leaves a structured trail (`src/audit/types.ts`):

| Event | When |
|---|---|
| `ai.query` | A query is sent (provider, model, query truncated to 200 chars, history depth) |
| `ai.response` | Streaming finished (`ok` or `aborted`, with latency) |
| `ai.error` | Provider error |
| `ai.skill_loaded` / `ai.skills_ready` | Skill files discovered at startup |
| `ai.skill_selected` | Routing decision per query (skill, keywords, confidence, source) |
| `ai.context_inject` | Prior conversation injected into the Claude CLI system prompt |
| `ai.compression` | History summarized after crossing `summary_threshold` |
| `ai.tool_call` / `ai.tool_result` | Each MCP tool invocation and its outcome (see [MCP server](mcp-server.md)) |

Bearer tokens and `api_key`/`token` fields are redacted before writing.
Validated by: `tests/audit.test.ts`.

## Related Documentation

- [README](../README.md) — features, installation, quick start
- [MCP server](mcp-server.md) — the tool server the assistant uses for live data
- [Developer guide](developer-guide.md) — architecture and module map
