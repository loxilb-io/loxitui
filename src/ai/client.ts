import { getAuditLogger } from "@/audit";
import type { ValidatedConfig } from "@/config";
import { ProviderRegistry } from "./provider/registry";
import type { LlmProvider, Message, ProviderMeta } from "./provider/types";
import { buildSystemPrompt } from "./system-prompt";

export type ProviderMessage = Message;

export interface AiClientOptions {
  config: ValidatedConfig;
}

export interface StreamOptions {
  messages: ProviderMessage[];
  systemPrompt?: string;
  onChunk: (delta: string) => void;
  onToolEvent?: (type: "tool_use" | "tool_result", toolName: string, content: string) => void;
  signal?: AbortSignal;
}

export class AiClient {
  private provider: LlmProvider | null = null;
  private readonly config: ValidatedConfig;

  constructor(opts: AiClientOptions) {
    this.config = opts.config;
  }

  /** Lazily initialize the provider (async because claude-cli uses dynamic import) */
  private async getProvider(): Promise<LlmProvider> {
    if (!this.provider) {
      const registry = new ProviderRegistry();
      this.provider = await registry.createDefault(this.config.ai, this.config.loxilb);
    }
    return this.provider;
  }

  get isConfigured(): boolean {
    // claude-cli uses the claude binary (no API key needed)
    // ollama uses local HTTP (no API key needed)
    return true;
  }

  /** Validate the provider is reachable; returns null on success or actionable error string */
  async validate(): Promise<string | null> {
    const provider = await this.getProvider();
    return provider.validate();
  }

  get providerName(): string {
    return this.provider?.meta.displayName ?? this.config.ai.provider;
  }

  async getProviderMeta(): Promise<ProviderMeta> {
    const provider = await this.getProvider();
    return provider.meta;
  }

  /**
   * Lightweight skill classifier. Asks the LLM to pick the best skill name from
   * the loaded SKILL_MAP for the given query. Returns null on timeout or error.
   * Timeout is hard-capped at 5 seconds so the caller degrades to "default" quickly.
   */
  async classifySkill(query: string): Promise<string | null> {
    const { SKILL_MAP } = await import("./skills");
    const provider = await this.getProvider();

    // Build skill list excluding the fallback "default" entry
    const skillList = Object.entries(SKILL_MAP)
      .filter(([k]) => k !== "default")
      .map(([k, s]) => `- ${k}: ${s.description}`)
      .join("\n");

    if (!skillList) return null;

    const systemPrompt = `You are a query classifier for a LoxiLB operations tool.
Given a user query, reply with EXACTLY one skill name from the list below, or "default" if none fit.
Do NOT explain. Reply with only the skill name.

Available skills:
${skillList}`;

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5_000);

    try {
      let result = "";
      const gen = provider.stream({
        messages: [{ role: "user", content: query }],
        systemPrompt,
        maxTokens: 20,
      });
      for await (const event of gen) {
        if (abort.signal.aborted) break;
        if (event.type === "token" && event.token) result += event.token;
        if (event.type === "error") return null;
      }
      return result.trim().toLowerCase() || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async stream(opts: StreamOptions): Promise<string> {
    const provider = await this.getProvider();

    // Use buildSystemPrompt as default system prompt if none provided
    const systemPrompt = opts.systemPrompt ?? buildSystemPrompt();

    // Emit ai.query before starting (query truncated to 200 chars, no system prompt content)
    const audit = getAuditLogger();
    audit.log({
      event: "ai.query",
      component: "ai",
      data: {
        provider: provider.meta.id,
        model: provider.meta.defaultModel,
        query: opts.messages.at(-1)?.content?.slice(0, 200) ?? "",
        history_turns: Math.max(0, opts.messages.length - 1),
      },
    });

    const t0 = Date.now();
    let fullText = "";
    const gen = provider.stream({
      messages: opts.messages,
      systemPrompt,
      maxTokens: 2048,
    });

    try {
      for await (const event of gen) {
        if (opts.signal?.aborted) break;
        if (event.type === "token" && event.token) {
          fullText += event.token;
          opts.onChunk(event.token);
        } else if (event.type === "tool_use" && opts.onToolEvent) {
          opts.onToolEvent("tool_use", event.toolName ?? "", event.toolInput ?? "");
        } else if (event.type === "tool_result" && opts.onToolEvent) {
          opts.onToolEvent("tool_result", event.toolName ?? "", event.toolResult ?? "");
        } else if (event.type === "error") {
          throw new Error(event.error ?? "Unknown provider error");
        }
      }
    } catch (err: unknown) {
      audit.log({
        event: "ai.error",
        level: "ERROR",
        component: "ai",
        ms: Date.now() - t0,
        data: {
          provider: provider.meta.id,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }

    // aborted streams exit the loop early via break — still emit ai.response
    audit.log({
      event: "ai.response",
      component: "ai",
      ms: Date.now() - t0,
      data: {
        provider: provider.meta.id,
        status: opts.signal?.aborted ? "aborted" : "ok",
      },
    });

    return fullText;
  }
}
