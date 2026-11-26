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

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_DEFAULT_MODEL = "gemini-4-hydrogen";

// max_output_tokens covers thinking as well, so a small cap ends the turn before the answer.
const MIN_OUTPUT_TOKENS = 16_000;

/** An interaction step, kept as received so it can be sent back unchanged. */
type Step = Record<string, unknown> & { type: string };

interface StreamPayload {
  event_type?: string;
  index?: number;
  step?: Step;
  delta?: { type?: string; text?: string; signature?: string; arguments?: string };
  interaction?: { status?: string };
  error?: { message?: string; code?: string };
}

const textStep = (type: "user_input" | "model_output", text: string): Step => ({
  type,
  content: [{ type: "text", text }],
});

/** Gemini Interactions API, stateless: the whole history travels with every request. */
export class GeminiProvider implements LlmProvider {
  readonly meta: ProviderMeta;
  private readonly api: LoxilbApi;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: ApiProviderOptions) {
    this.api = opts.api;
    this.apiKey = opts.apiKey;
    this.model = opts.model || GEMINI_DEFAULT_MODEL;
    this.meta = {
      id: "gemini",
      displayName: "Gemini",
      defaultModel: this.model,
      contextWindow: 1_000_000,
      supportStream: true,
      requiresApiKey: true,
      apiKeyEnvVar: "GEMINI_API_KEY",
      docsUrl: "https://ai.google.dev/gemini-api/docs/interactions",
    };
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", "x-goog-api-key": this.apiKey };
  }

  async validate(): Promise<string | null> {
    if (!this.apiKey) {
      return "Gemini API key not set. Set [ai] api_key in the config or GEMINI_API_KEY.";
    }
    try {
      const resp = await fetch(`${GEMINI_BASE_URL}/models?pageSize=1`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      // An invalid key is a 400 on this endpoint
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        return `Gemini rejected the API key (HTTP ${resp.status}).`;
      }
      if (!resp.ok) return `Gemini API answered HTTP ${resp.status}.`;
      return null;
    } catch {
      return `Gemini API not reachable at ${GEMINI_BASE_URL}.`;
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    const history: Step[] = [];
    for (const m of req.messages) {
      if (m.role === "user") history.push(textStep("user_input", m.content));
      else if (m.role === "assistant") history.push(textStep("model_output", m.content));
    }

    const tools = req.disableTools
      ? undefined
      : toolSpecs().map((t) => ({ type: "function", ...t }));
    const abort = new AbortController();
    // Ends on the caller's signal, and when the caller stops reading
    const signal = req.signal ? AbortSignal.any([req.signal, abort.signal]) : abort.signal;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let resp: Response;
        try {
          resp = await fetch(`${GEMINI_BASE_URL}/interactions`, {
            method: "POST",
            headers: this.headers(),
            signal,
            body: JSON.stringify({
              model: this.model,
              input: history,
              system_instruction: req.systemPrompt || undefined,
              tools,
              generation_config: {
                max_output_tokens: Math.max(req.maxTokens ?? 0, MIN_OUTPUT_TOKENS),
              },
              store: false,
              stream: true,
            }),
          });
        } catch (err: unknown) {
          if (req.signal?.aborted) return;
          yield { type: "error", error: `Gemini request failed: ${errorMessage(err)}` };
          return;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => resp.statusText);
          yield { type: "error", error: `Gemini error ${resp.status}: ${text}` };
          return;
        }

        const steps: Step[] = [];
        const argsJson = new Map<number, string>();
        const badArgs = new Set<Step>();
        let status = "";
        let sawText = false;

        for await (const data of sseData(resp)) {
          let event: StreamPayload;
          try {
            event = JSON.parse(data) as StreamPayload;
          } catch {
            continue;
          }

          if (event.event_type === "error") {
            yield {
              type: "error",
              error: `Gemini error: ${event.error?.message ?? event.error?.code ?? "unknown"}`,
            };
            return;
          }

          const index = event.index ?? 0;
          if (event.event_type === "step.start" && event.step) {
            steps[index] = { ...event.step };
          } else if (event.event_type === "step.delta" && event.delta) {
            const step = steps[index];
            const delta = event.delta;
            if (!step) continue;
            if (delta.type === "text" && delta.text) {
              step.content ??= [];
              const content = step.content as Array<{ type: string; text?: string }>;
              const last = content.at(-1);
              if (last?.type === "text") last.text = `${last.text ?? ""}${delta.text}`;
              else content.push({ type: "text", text: delta.text });
              sawText = true;
              yield { type: "token", token: delta.text };
            } else if (delta.type === "thought_signature") {
              step.signature = delta.signature;
            } else if (delta.type === "arguments_delta") {
              argsJson.set(index, (argsJson.get(index) ?? "") + (delta.arguments ?? ""));
            }
          } else if (event.event_type === "step.stop") {
            const step = steps[index];
            if (step?.type === "function_call" && argsJson.has(index)) {
              const parsed = parseToolArgs(argsJson.get(index) ?? "");
              // The step goes back to the API, which takes only an object here
              step.arguments = parsed ?? {};
              if (!parsed) badArgs.add(step);
            }
          } else if (event.event_type === "interaction.completed") {
            status = event.interaction?.status ?? "";
          }
        }

        const produced = steps.filter(Boolean);
        const calls = produced.filter((s) => s.type === "function_call");

        if (status === "failed") {
          yield { type: "error", error: "Gemini could not complete the request." };
          return;
        }
        // A turn cut short may end inside a tool call's arguments; those are not run
        if (status === "incomplete" && (calls.length > 0 || !sawText)) {
          yield { type: "error", error: "Gemini reached the output token limit before answering." };
          return;
        }
        if (calls.length === 0) {
          if (sawText) yield { type: "done" };
          else yield { type: "error", error: "Gemini returned an empty answer." };
          return;
        }

        // Thought steps carry signatures the next request is checked against
        history.push(...produced);

        for (const call of calls) {
          const id = String(call.id ?? "");
          const name = String(call.name ?? "");
          const args = (call.arguments ?? {}) as Record<string, unknown>;
          yield { type: "tool_use", toolName: name, toolInput: JSON.stringify(args) };
          const outcome = await runTool(
            { id, name, args: badArgs.has(call) ? null : args },
            this.api
          );
          yield { type: "tool_result", toolName: name, toolResult: outcome.content };
          history.push({
            type: "function_result",
            name,
            call_id: id,
            result: [{ type: "text", text: outcome.content }],
          });
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
      const resp = await fetch(`${GEMINI_BASE_URL}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [this.model];
      const body = (await resp.json()) as { models?: Array<{ name?: string }> };
      const ids =
        body.models?.map((m) => (m.name ?? "").replace(/^models\//, "")).filter(Boolean) ?? [];
      return ids.length > 0 ? ids : [this.model];
    } catch {
      return [this.model];
    }
  }
}
