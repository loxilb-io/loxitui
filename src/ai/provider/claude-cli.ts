import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMcpToolNames } from "@/ai/system-prompt";
import { getAuditLogPath, getAuditLogger, getAuditSessionId } from "@/audit";
import type { InferenceRequest, LlmProvider, ProviderMeta, StreamEvent } from "./types";

const META: ProviderMeta = {
  id: "claude-cli",
  displayName: "Claude CLI",
  defaultModel: "sonnet",
  contextWindow: 200_000,
  supportStream: true,
  requiresApiKey: false,
  apiKeyEnvVar: "",
  docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
};

export class ClaudeCliProvider implements LlmProvider {
  readonly meta = META;

  constructor(
    private readonly loxilbHost: string = "127.0.0.1",
    private readonly loxilbPort: number = 11111,
    private readonly loxilbTls: boolean = false,
    private readonly loxilbToken: string = ""
  ) {}

  async validate(): Promise<string | null> {
    try {
      const proc = Bun.spawn(["claude", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return "claude CLI exited with non-zero status. Ensure Claude Code is installed and working.";
      }
      return null;
    } catch {
      return "claude CLI not found in PATH. Install from https://docs.anthropic.com/en/docs/claude-code";
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    // Resolve path to cli.tsx relative to this file (only valid in dev/source mode).
    // import.meta.dir is Bun-specific: directory of current file.
    const cliPath = join(import.meta.dir, "..", "..", "cli.tsx");

    // Detect whether we're running as a compiled binary or from source.
    // In compiled mode (bun build --compile) cli.tsx doesn't exist on disk —
    // the MCP subprocess must be spawned by re-executing the binary itself.
    // In dev mode (bun run src/cli.tsx) we spawn via "bun run <cliPath>".
    const isCompiledBinary = !existsSync(cliPath);
    const mcpCommand = isCompiledBinary ? process.execPath : "bun";
    const mcpArgs = isCompiledBinary ? ["--mcp-server"] : ["run", cliPath, "--mcp-server"];

    // Write temp mcp_config.json (AI-04)
    const configPath = join(tmpdir(), `loxilb-mcp-${randomUUID()}.json`);
    const mcpConfig = {
      mcpServers: {
        // Server name must match the prefix used in the system prompt (mcp__loxilb__*).
        // Using "loxilb" (no hyphen) keeps tool names clean and predictable.
        loxilb: {
          type: "stdio",
          command: mcpCommand,
          args: mcpArgs,
          env: {
            LOXILB_HOST: this.loxilbHost,
            LOXILB_PORT: String(this.loxilbPort),
            LOXILB_TLS: String(this.loxilbTls),
            LOXILB_TOKEN: this.loxilbToken,
            // Pass audit context to MCP subprocess so tool calls share session ID and log file
            LOXILB_AUDIT_LOG_PATH: getAuditLogPath(),
            LOXILB_AUDIT_SESSION_ID: getAuditSessionId(),
          },
        },
      },
    };

    await writeFile(configPath, JSON.stringify(mcpConfig), "utf-8");

    try {
      // Build CLI args (AI-02)
      // NOTE: --verbose is REQUIRED when using --output-format stream-json (claude >=2.1.x)
      //
      // Tool control strategy (eliminates ToolSearch discovery round-trip):
      //   --tools ""          → disables ALL built-in tools (Bash, WebFetch, ToolSearch, Edit…)
      //                         ToolSearch is a built-in tool; --allowedTools alone cannot block it.
      //   --allowedTools …    → allow-list restricted to our MCP tools only (defence in depth)
      //
      // Without --tools "", claude always runs ToolSearch first (~10-15s) even when
      // --allowedTools already lists every tool by exact name.
      const allowedTools = getMcpToolNames().join(",");
      const args: string[] = [
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
        "--mcp-config",
        configPath,
        "--tools",
        "",
        "--allowedTools",
        allowedTools,
        "--dangerously-skip-permissions",
      ];

      // Build system prompt, injecting prior conversation turns so Claude CLI
      // maintains multi-turn context. Only the final user message goes via stdin;
      // everything before it is embedded in the system prompt as a conversation
      // record (claude CLI accepts a single stdin prompt per invocation).
      const MAX_HISTORY_INJECT_CHARS = 40_000;
      const priorMessages = req.messages.slice(0, -1);
      let effectiveSystemPrompt = req.systemPrompt ?? "";
      if (priorMessages.length > 0) {
        let historyBlock = "\n\n## Prior Conversation\n";
        for (const m of priorMessages) {
          const label = m.role === "user" ? "[User]" : "[Assistant]";
          historyBlock += `\n${label}: ${m.content}\n`;
        }
        const rawLen = historyBlock.length;
        // Cap to stay well within the 200k context window
        let truncated = false;
        if (historyBlock.length > MAX_HISTORY_INJECT_CHARS) {
          historyBlock = `\n\n## Prior Conversation\n[...earlier turns omitted...]\n${historyBlock.slice(-MAX_HISTORY_INJECT_CHARS)}`;
          truncated = true;
        }
        effectiveSystemPrompt += historyBlock;
        getAuditLogger().log({
          event: "ai.context_inject",
          component: "ai",
          data: {
            prior_msgs: priorMessages.length,
            inject_chars: historyBlock.length,
            truncated,
          },
        });
      }
      if (effectiveSystemPrompt) {
        args.push("--system-prompt", effectiveSystemPrompt);
      }

      // Extract last user message as the stdin prompt.
      // Pass via stdin (not as a CLI arg) to avoid shell interpretation of special
      // characters in prompts: markdown bullets, backticks, '?', etc.
      // (technique learned from ralph-tui's claude agent)
      const lastUserMsg = [...req.messages].reverse().find((m) => m.role === "user");
      const stdinPrompt = lastUserMsg?.content ?? "";

      const proc = Bun.spawn(["claude", ...args], {
        stdin: new TextEncoder().encode(stdinPrompt),
        stdout: "pipe",
        // Drain stderr concurrently to prevent pipe-buffer deadlock when --verbose
        // produces large amounts of progress output
        stderr: "pipe",
        // IS_SANDBOX=1 is required when --dangerously-skip-permissions is active
        // on Linux systems running as root; without it claude may exit non-zero.
        // (learned from ralph-tui claude agent)
        env: { ...process.env, IS_SANDBOX: "1" },
      });

      // Drain stderr in background to prevent deadlock (pipe buffer ~64KB).
      // Collect it so we can surface useful error messages if the process fails.
      let stderrText = "";
      const stderrDone = (async () => {
        const sr = proc.stderr.getReader();
        const sd = new TextDecoder();
        try {
          while (true) {
            const { value, done } = await sr.read();
            if (done) break;
            const chunk = sd.decode(value, { stream: true });
            stderrText += chunk;
            // Mirror MCP subprocess stderr lines to our own stderr for debugging.
            // Prefix makes them easy to grep: "[mcp-debug]"
            for (const line of chunk.split("\n")) {
              if (line.trim()) process.stderr.write(`[mcp-debug] ${line}\n`);
            }
          }
        } finally {
          sr.releaseLock();
        }
      })();

      // Parse JSONL stream from stdout (AI-03)
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokensYielded = 0;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const event = JSON.parse(trimmed) as Record<string, unknown>;

              // Handle different JSONL event formats from claude --output-format stream-json
              if (event.type === "assistant") {
                // Full assistant message — extract text blocks and tool_use calls
                const message = event.message as
                  | {
                      content?: Array<{
                        type: string;
                        text?: string;
                        name?: string;
                        input?: unknown;
                      }>;
                    }
                  | undefined;
                if (message?.content) {
                  for (const block of message.content) {
                    if (block.type === "text" && block.text) {
                      yield { type: "token", token: block.text };
                      tokensYielded++;
                    } else if (block.type === "tool_use" && block.name) {
                      yield {
                        type: "tool_use",
                        toolName: block.name,
                        toolInput: JSON.stringify(block.input ?? {}),
                      };
                    }
                  }
                }
              } else if (event.type === "tool") {
                // Tool result returned by MCP server via claude CLI
                const toolName = (event.tool_name ?? event.toolName) as string | undefined;
                const content = event.content;
                yield {
                  type: "tool_result",
                  toolName: toolName ?? "unknown",
                  toolResult: typeof content === "string" ? content : JSON.stringify(content ?? ""),
                };
              } else if (event.type === "content_block_delta") {
                // Incremental delta
                const delta = event.delta as { type: string; text?: string } | undefined;
                if (delta?.type === "text_delta" && delta.text) {
                  yield { type: "token", token: delta.text };
                  tokensYielded++;
                }
              } else if (
                (event.event as Record<string, unknown> | undefined)?.type === "content_block_delta"
              ) {
                // Wrapped event format
                const innerEvent = event.event as Record<string, unknown>;
                const delta = innerEvent.delta as { type: string; text?: string } | undefined;
                if (delta?.type === "text_delta" && delta.text) {
                  yield { type: "token", token: delta.text };
                  tokensYielded++;
                }
              } else if (event.type === "result") {
                // Fallback: surface the final result text if no tokens were streamed
                const result = event.result as string | undefined;
                if (result && tokensYielded === 0) {
                  yield { type: "token", token: result };
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Wait for stderr drain and process exit
      await stderrDone;
      const exitCode = await proc.exited;

      // Non-zero exit with no tokens = report error from stderr
      if (exitCode !== 0 && tokensYielded === 0) {
        const errMsg = stderrText.trim().split("\n").pop() ?? `Exit code ${exitCode}`;
        yield { type: "error", error: `Claude CLI error: ${errMsg}` };
        return;
      }

      yield { type: "done" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: `Claude CLI error: ${msg}` };
    } finally {
      // Cleanup temp config (AI-04)
      await unlink(configPath).catch(() => {});
    }
  }

  async listModels(): Promise<string[]> {
    return ["sonnet", "opus", "haiku"];
  }
}
