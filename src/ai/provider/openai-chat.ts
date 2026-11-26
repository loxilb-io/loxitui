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

// A reasoning model behind the server spends output tokens before the first visible
// one, so a small cap returns an empty answer.
const MIN_OUTPUT_TOKENS = 4096;

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  // Fields a server adds to a call (a signature, say) and expects back with it
  [extra: string]: unknown;
}

/** A tool call being put together from stream deltas. */
interface PendingCall {
  id: string;
  name: string;
  args: string;
  extra: Record<string, unknown>;
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatChunk {
  error?: { message?: string };
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
        [extra: string]: unknown;
      }>;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * Chat Completions streaming with tool calls, for servers that speak the OpenAI API
 * (vLLM, llama.cpp, LM Studio, a gateway in front of them). OpenAI itself is OpenAiProvider.
 */
export class OpenAiChatProvider implements LlmProvider {
  readonly meta: ProviderMeta;
  private readonly api: LoxilbApi;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: ApiProviderOptions) {
    this.api = opts.api;
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "";
    this.baseUrl = (opts.baseUrl ?? "").replace(/\/+$/, "");
    this.meta = {
      id: "openai",
      displayName: "OpenAI-compatible",
      defaultModel: this.model,
      // The server does not report its window here; assume a small one so history is
      // summarized early rather than overflowing.
      contextWindow: 128_000,
      supportStream: true,
      requiresApiKey: false,
      apiKeyEnvVar: "",
      docsUrl: "https://platform.openai.com/docs/api-reference/chat",
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async validate(): Promise<string | null> {
    if (!this.model) {
      return `Set [ai] model to a model served at ${this.baseUrl}.`;
    }
    try {
      const resp = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.status === 401 || resp.status === 403) {
        return `${this.baseUrl} rejected the API key (HTTP ${resp.status}).`;
      }
      // Not every compatible server lists its models; a 404 still proves it is there
      if (!resp.ok && resp.status !== 404) {
        return `${this.baseUrl} answered HTTP ${resp.status}.`;
      }
      return null;
    } catch {
      return `OpenAI-compatible API not reachable at ${this.baseUrl}.`;
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    const messages: ChatMessage[] = [];
    if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
    for (const m of req.messages) {
      if (m.role !== "system") messages.push({ role: m.role, content: m.content });
    }

    const tools = req.disableTools
      ? undefined
      : toolSpecs().map((t) => ({ type: "function" as const, function: t }));
    const maxTokens = Math.max(req.maxTokens ?? 0, MIN_OUTPUT_TOKENS);
    const abort = new AbortController();
    // Ends on the caller's signal, and when the caller stops reading
    const signal = req.signal ? AbortSignal.any([req.signal, abort.signal]) : abort.signal;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let resp: Response;
        try {
          resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: this.headers(),
            signal,
            body: JSON.stringify({
              model: this.model,
              messages,
              tools,
              stream: true,
              max_tokens: maxTokens,
            }),
          });
        } catch (err: unknown) {
          if (req.signal?.aborted) return;
          yield {
            type: "error",
            error: `${this.meta.displayName} request failed: ${errorMessage(err)}`,
          };
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => resp.statusText);
          yield { type: "error", error: `${this.meta.displayName} error ${resp.status}: ${text}` };
          return;
        }

        let text = "";
        let finishReason = "";
        const calls: PendingCall[] = [];
        const byIndex = new Map<number, PendingCall>();

        for await (const data of sseData(resp)) {
          if (data === "[DONE]") break;
          let chunk: ChatChunk;
          try {
            chunk = JSON.parse(data) as ChatChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            yield {
              type: "error",
              error: `${this.meta.displayName} error: ${chunk.error.message ?? "unknown"}`,
            };
            return;
          }
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            text += choice.delta.content;
            yield { type: "token", token: choice.delta.content };
          }
          for (const tc of choice.delta?.tool_calls ?? []) {
            const { index, id, type: _type, function: fn, ...extra } = tc;
            // The index tells calls apart. A server that leaves it out or repeats it
            // still sends each call's id once, so a different id starts another call.
            let slot = index === undefined ? calls.at(-1) : byIndex.get(index);
            if (!slot || (id && slot.id && id !== slot.id)) {
              slot = { id: "", name: "", args: "", extra: {} };
              calls.push(slot);
            }
            if (index !== undefined) byIndex.set(index, slot);
            Object.assign(slot.extra, extra);
            if (id) slot.id = id;
            if (fn?.name) slot.name += fn.name;
            if (fn?.arguments) slot.args += fn.arguments;
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }

        const pending = calls.filter((c) => c.name);
        // A turn cut short may end inside a tool call's arguments; those are not run
        if (finishReason === "length" && (pending.length > 0 || !text)) {
          yield {
            type: "error",
            error: `${this.meta.displayName} reached the output token limit before answering.`,
          };
          return;
        }
        if (pending.length === 0) {
          if (text) yield { type: "done" };
          else yield { type: "error", error: `${this.meta.displayName} returned an empty answer.` };
          return;
        }

        const toolCalls: ChatToolCall[] = pending.map((c, i) => ({
          ...c.extra,
          id: c.id || `call_${round}_${i}`,
          type: "function",
          function: { name: c.name, arguments: c.args || "{}" },
        }));
        messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });

        for (const tc of toolCalls) {
          const { name, arguments: args } = tc.function;
          yield { type: "tool_use", toolName: name, toolInput: args };
          const outcome = await runTool({ id: tc.id, name, args: parseToolArgs(args) }, this.api);
          yield { type: "tool_result", toolName: name, toolResult: outcome.content };
          messages.push({ role: "tool", tool_call_id: tc.id, content: outcome.content });
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
      const resp = await fetch(`${this.baseUrl}/models`, {
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
