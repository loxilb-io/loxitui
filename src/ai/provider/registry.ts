import type { AiConfig } from "@/config/types";
import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./types";

export type ProviderName = "claude-cli" | "ollama";

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

    let provider: LlmProvider;
    switch (name) {
      case "ollama":
        provider = new OllamaProvider(model, baseUrl ?? "http://localhost:11434");
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

export { OllamaProvider };
export type { LlmProvider };
