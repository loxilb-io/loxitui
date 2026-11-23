import { LoxilbApi } from "@/api/index";
import { type AiConfig, DEFAULT_CONFIG } from "@/config/types";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { OpenAiProvider } from "./openai";
import { OpenAiChatProvider } from "./openai-chat";
import type { ApiProviderOptions, LlmProvider } from "./types";

export type ProviderName = "claude-cli" | "ollama" | "openai" | "anthropic" | "gemini";

/** Environment variable each API provider falls back to when [ai] api_key is empty. */
const API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** What `setup` writes into `model` for the Claude CLI. No hosted API serves it. */
const CLI_MODEL = "sonnet";

export function resolveApiKey(config: AiConfig): string {
  // A base_url points openai at another server; the OpenAI key in the environment
  // is not meant for it
  if (config.provider === "openai" && config.base_url) return config.api_key;
  return config.api_key || process.env[API_KEY_ENV[config.provider] ?? ""] || "";
}

/**
 * Whether the configured provider is still missing a key it cannot work without.
 * An OpenAI-compatible server at a custom base_url may need none.
 */
export function isApiKeyMissing(config: AiConfig): boolean {
  const provider = config.provider || "claude-cli";
  if (provider === "claude-cli" || provider === "ollama") return false;
  if (provider === "openai" && config.base_url) return false;
  return !resolveApiKey(config);
}

export class ProviderRegistry {
  private readonly providers = new Map<string, LlmProvider>();

  register(provider: LlmProvider): void {
    this.providers.set(provider.meta.id, provider);
  }

  get(id: string): LlmProvider | undefined {
    return this.providers.get(id);
  }

  list(): LlmProvider[] {
    return [...this.providers.values()];
  }

  /** Create and return a provider based on config, registering it in the process */
  async createDefault(
    config: AiConfig,
    loxilb?: { host: string; port: number; tls: boolean; token: string }
  ): Promise<LlmProvider> {
    const name = (config.provider || "claude-cli") as ProviderName;
    const model = config.model;
    const baseUrl = config.base_url || undefined;

    // The API providers run the gateway tools in this process, on their own client
    // A model nobody chose is left to the provider: the schema default, and for the
    // hosted APIs the name setup writes. Another server may well serve a "sonnet".
    const apiOptions = (hosted = true): ApiProviderOptions => ({
      api: new LoxilbApi({
        host: loxilb?.host ?? DEFAULT_CONFIG.loxilb.host,
        port: loxilb?.port ?? DEFAULT_CONFIG.loxilb.port,
        tls: loxilb?.tls ?? DEFAULT_CONFIG.loxilb.tls,
        token: loxilb?.token ?? "",
      }),
      apiKey: resolveApiKey(config),
      model:
        model && model !== DEFAULT_CONFIG.ai.model && !(hosted && model === CLI_MODEL)
          ? model
          : undefined,
      baseUrl,
    });

    let provider: LlmProvider;
    switch (name) {
      case "ollama":
        provider = new OllamaProvider(model, baseUrl ?? "http://localhost:11434");
        break;
      case "openai":
        // A base_url means another server that speaks the Chat Completions API
        provider = baseUrl
          ? new OpenAiChatProvider(apiOptions(false))
          : new OpenAiProvider(apiOptions());
        break;
      case "anthropic":
        provider = new AnthropicProvider(apiOptions());
        break;
      case "gemini":
        provider = new GeminiProvider(apiOptions());
        break;
      // "claude-cli" and any unrecognized provider name use the Claude CLI
      default: {
        const { ClaudeCliProvider } = await import("./claude-cli");
        provider = new ClaudeCliProvider(loxilb?.host, loxilb?.port, loxilb?.tls, loxilb?.token);
        break;
      }
    }

    this.register(provider);
    return provider;
  }
}

export { AnthropicProvider, GeminiProvider, OllamaProvider, OpenAiChatProvider, OpenAiProvider };
export type { LlmProvider };
