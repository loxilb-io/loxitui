import type { LoxilbApi } from "@/api/index";
import { sseData } from "./sse";
import { MAX_TOOL_ROUNDS, errorMessage, parseToolArgs, runTool, toolSpecs } from "./tool-calls";
import type {
  ApiProviderOptions,
  InferenceRequest,
  LlmProvider,
  ProviderMeta,
  StreamEvent,
} from "./types";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
const API_VERSION = "2026-10-21";

// Thinking is always on for current models and counts against max_tokens, so a small
// cap is spent before the answer starts.
const MIN_OUTPUT_TOKENS = 16_000;

/** A response content block, kept as received so it can be sent back unchanged. */
type ContentBlock = Record<string, unknown> & { type: string };

type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

interface StreamPayload {
  type: string;
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
    stop_reason?: string | null;
  };
  error?: { type?: string; message?: string };
}

/** Anthropic Messages API streaming with tool use. */
export class AnthropicProvider implements LlmProvider {
  readonly meta: ProviderMeta;
  private readonly api: LoxilbApi;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: ApiProviderOptions) {
    this.api = opts.api;
    this.apiKey = opts.apiKey;
    this.model = opts.model || ANTHROPIC_DEFAULT_MODEL;
    this.meta = {
      id: "anthropic",
      displayName: "Anthropic",
      defaultModel: this.model,
      // Older models have a smaller window; assume it for any model but the default
      contextWindow: this.model === ANTHROPIC_DEFAULT_MODEL ? 1_000_000 : 200_000,
      supportStream: true,
      requiresApiKey: true,
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      docsUrl: "https://platform.claude.com/docs/en/api/messages",
    };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
    };
  }

  async validate(): Promise<string | null> {
    if (!this.apiKey) {
      return "Anthropic API key not set. Set [ai] api_key in the config or ANTHROPIC_API_KEY.";
    }
    try {
      const resp = await fetch(`${ANTHROPIC_BASE_URL}/v1/models?limit=1`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.status === 401 || resp.status === 403) {
        return `Anthropic rejected the API key (HTTP ${resp.status}).`;
      }
      if (!resp.ok) return `Anthropic API answered HTTP ${resp.status}.`;
      return null;
    } catch {
      return `Anthropic API not reachable at ${ANTHROPIC_BASE_URL}.`;
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    const messages: ApiMessage[] = [];
    for (const m of req.messages) {
      // The API rejects a message that is only whitespace, which the sidebar keeps
      // when the model wrote nothing but a line break before a tool call
      if (m.role !== "system" && m.content.trim()) {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const tools = req.disableTools
      ? undefined
      : toolSpecs().map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
    const abort = new AbortController();
    // Ends on the caller's signal, and when the caller stops reading
    const signal = req.signal ? AbortSignal.any([req.signal, abort.signal]) : abort.signal;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let resp: Response;
        try {
          resp = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
            method: "POST",
            headers: this.headers(),
            signal,
            body: JSON.stringify({
              model: this.model,
              max_tokens: Math.max(req.maxTokens ?? 0, MIN_OUTPUT_TOKENS),
              system: req.systemPrompt || undefined,
              messages,
              tools,
              stream: true,
            }),
          });
        } catch (err: unknown) {
          if (req.signal?.aborted) return;
          yield { type: "error", error: `Anthropic request failed: ${errorMessage(err)}` };
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => resp.statusText);
          yield { type: "error", error: `Anthropic error ${resp.status}: ${text}` };
          return;
        }

        const blocks: ContentBlock[] = [];
        const toolJson = new Map<number, string>();
        const badInput = new Set<ContentBlock>();
        let stopReason = "";
        let sawText = false;

        for await (const data of sseData(resp)) {
          let event: StreamPayload;
          try {
            event = JSON.parse(data) as StreamPayload;
          } catch {
            continue;
          }

          if (event.type === "error") {
            yield {
              type: "error",
              error: `Anthropic error: ${event.error?.message ?? event.error?.type ?? "unknown"}`,
            };
            return;
          }

          const index = event.index ?? 0;
          if (event.type === "content_block_start" && event.content_block) {
            blocks[index] = { ...event.content_block };
          } else if (event.type === "content_block_delta" && event.delta) {
            const block = blocks[index];
            const delta = event.delta;
            if (!block) continue;
            if (delta.type === "text_delta" && delta.text) {
              block.text = `${(block.text as string | undefined) ?? ""}${delta.text}`;
              sawText = true;
              yield { type: "token", token: delta.text };
            } else if (delta.type === "input_json_delta") {
              toolJson.set(index, (toolJson.get(index) ?? "") + (delta.partial_json ?? ""));
            } else if (delta.type === "thinking_delta") {
              block.thinking = `${(block.thinking as string | undefined) ?? ""}${delta.thinking ?? ""}`;
            } else if (delta.type === "signature_delta") {
              block.signature = delta.signature;
            }
          } else if (event.type === "content_block_stop") {
            const block = blocks[index];
            if (block?.type === "tool_use") {
              const input = parseToolArgs(toolJson.get(index) ?? "");
              // The block goes back to the API, which takes only an object here
              block.input = input ?? {};
              if (!input) badInput.add(block);
            }
          } else if (event.type === "message_delta" && event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        }

        const content = blocks.filter(Boolean);
        const toolUses = content.filter((b) => b.type === "tool_use");

        if (stopReason !== "tool_use" || toolUses.length === 0) {
          if (stopReason === "refusal") {
            yield { type: "error", error: "Anthropic declined to answer this request." };
            return;
          }
          if (stopReason === "max_tokens" && !sawText) {
            yield {
              type: "error",
              error: "Anthropic reached the output token limit before answering.",
            };
            return;
          }
          if (sawText) yield { type: "done" };
          else yield { type: "error", error: "Anthropic returned an empty answer." };
          return;
        }

        // Thinking blocks go back exactly as they came: the API checks them on the next request
        messages.push({ role: "assistant", content });

        const results: ContentBlock[] = [];
        for (const use of toolUses) {
          const id = String(use.id ?? "");
          const name = String(use.name ?? "");
          const args = (use.input ?? {}) as Record<string, unknown>;
          yield { type: "tool_use", toolName: name, toolInput: JSON.stringify(args) };
          const outcome = await runTool(
            { id, name, args: badInput.has(use) ? null : args },
            this.api
          );
          yield { type: "tool_result", toolName: name, toolResult: outcome.content };
          results.push({
            type: "tool_result",
            tool_use_id: id,
            content: outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          });
        }
        // Every result of a turn belongs in one user message
        messages.push({ role: "user", content: results });
      }

      yield {
        type: "error",
        error: `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls without a final answer.`,
      };
    } catch (err: unknown) {
      if (req.signal?.aborted) return;
      yield { type: "error", error: `Stream read error: ${errorMessage(err)}` };
    } finally {
      abort.abort();
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${ANTHROPIC_BASE_URL}/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [this.model];
      const body = (await resp.json()) as { data?: Array<{ id?: string }> };
      const ids = body.data?.map((m) => m.id ?? "").filter(Boolean) ?? [];
      return ids.length > 0 ? ids : [this.model];
    } catch {
      return [this.model];
    }
  }
}
