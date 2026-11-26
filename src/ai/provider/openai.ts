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

export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DEFAULT_MODEL = "gpt-6.2-astra";

// Reasoning tokens count against max_output_tokens, so a small cap returns an empty answer.
const MIN_OUTPUT_TOKENS = 4096;

/** A response output item, kept as received so it can be sent back unchanged. */
type Item = Record<string, unknown> & { type: string };

interface StreamPayload {
  type?: string;
  delta?: string;
  item?: Item;
  message?: string;
  response?: {
    status?: string;
    error?: { message?: string } | null;
    incomplete_details?: { reason?: string } | null;
  };
}

/**
 * OpenAI Responses API streaming with function tools. Current OpenAI models take
 * tools only on this API; servers that speak Chat Completions use OpenAiChatProvider.
 */
export class OpenAiProvider implements LlmProvider {
  readonly meta: ProviderMeta;
  private readonly api: LoxilbApi;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: ApiProviderOptions) {
    this.api = opts.api;
    this.apiKey = opts.apiKey;
    this.model = opts.model || OPENAI_DEFAULT_MODEL;
    this.meta = {
      id: "openai",
      displayName: "OpenAI",
      defaultModel: this.model,
      // Older models have a smaller window; assume it for any model but the default
      contextWindow: this.model === OPENAI_DEFAULT_MODEL ? 1_050_000 : 128_000,
      supportStream: true,
      requiresApiKey: true,
      apiKeyEnvVar: "OPENAI_API_KEY",
      docsUrl: "https://platform.openai.com/docs/api-reference/responses",
    };
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` };
  }

  async validate(): Promise<string | null> {
    if (!this.apiKey) {
      return "OpenAI API key not set. Set [ai] api_key in the config or OPENAI_API_KEY.";
    }
    try {
      const resp = await fetch(`${OPENAI_BASE_URL}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.status === 401 || resp.status === 403) {
        return `OpenAI rejected the API key (HTTP ${resp.status}).`;
      }
      if (!resp.ok) return `OpenAI API answered HTTP ${resp.status}.`;
      return null;
    } catch {
      return "OpenAI API not reachable.";
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    const input: Item[] = [];
    for (const m of req.messages) {
      if (m.role !== "system") input.push({ type: "message", role: m.role, content: m.content });
    }

    // Strict mode is the default here and turns every optional parameter into a required one
    const tools = req.disableTools
      ? undefined
      : toolSpecs().map((t) => ({ type: "function", strict: false, ...t }));
    const abort = new AbortController();
    // Ends on the caller's signal, and when the caller stops reading
    const signal = req.signal ? AbortSignal.any([req.signal, abort.signal]) : abort.signal;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let resp: Response;
        try {
          resp = await fetch(`${OPENAI_BASE_URL}/responses`, {
            method: "POST",
            headers: this.headers(),
            signal,
            body: JSON.stringify({
              model: this.model,
              instructions: req.systemPrompt || undefined,
              input,
              tools,
              max_output_tokens: Math.max(req.maxTokens ?? 0, MIN_OUTPUT_TOKENS),
              // Nothing is kept on the server, so the reasoning behind a tool call has to
              // come back encrypted and travel with the tool results.
              store: false,
              include: ["reasoning.encrypted_content"],
              stream: true,
            }),
          });
        } catch (err: unknown) {
          if (req.signal?.aborted) return;
          yield { type: "error", error: `OpenAI request failed: ${errorMessage(err)}` };
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => resp.statusText);
          yield { type: "error", error: `OpenAI error ${resp.status}: ${text}` };
          return;
        }

        const items: Item[] = [];
        let sawText = false;
        let incomplete = "";

        for await (const data of sseData(resp)) {
          let event: StreamPayload;
          try {
            event = JSON.parse(data) as StreamPayload;
          } catch {
            continue;
          }

          if (event.type === "response.output_text.delta" && event.delta) {
            sawText = true;
            yield { type: "token", token: event.delta };
          } else if (event.type === "response.output_item.done" && event.item) {
            items.push(event.item);
          } else if (event.type === "response.incomplete") {
            incomplete = event.response?.incomplete_details?.reason ?? "unknown";
          } else if (event.type === "response.failed" || event.type === "error") {
            const message = event.response?.error?.message ?? event.message ?? "unknown";
            yield { type: "error", error: `OpenAI error: ${message}` };
            return;
          }
        }

        const calls = items.filter((i) => i.type === "function_call");
        // A turn cut short may end inside a tool call's arguments; those are not run
        if (incomplete && (calls.length > 0 || !sawText)) {
          yield {
            type: "error",
            error:
              incomplete === "max_output_tokens"
                ? "OpenAI reached the output token limit before answering."
                : `OpenAI stopped before answering (${incomplete}).`,
          };
          return;
        }
        if (calls.length === 0) {
          if (sawText) yield { type: "done" };
          else yield { type: "error", error: "OpenAI returned an empty answer." };
          return;
        }

        input.push(...items);

        for (const call of calls) {
          const id = String(call.call_id ?? "");
          const name = String(call.name ?? "");
          const args = String(call.arguments ?? "");
          yield { type: "tool_use", toolName: name, toolInput: args };
          const outcome = await runTool({ id, name, args: parseToolArgs(args) }, this.api);
          yield { type: "tool_result", toolName: name, toolResult: outcome.content };
          input.push({ type: "function_call_output", call_id: id, output: outcome.content });
        }
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
      const resp = await fetch(`${OPENAI_BASE_URL}/models`, {
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
