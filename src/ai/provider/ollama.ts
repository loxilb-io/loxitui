import type { InferenceRequest, LlmProvider, ProviderMeta, StreamEvent } from "./types";

const META: ProviderMeta = {
  id: "ollama",
  displayName: "Ollama (Local)",
  defaultModel: "llama3.1:8b",
  contextWindow: 128_000,
  supportStream: true,
  requiresApiKey: false,
  apiKeyEnvVar: "",
  docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
};

/** Ollama local model via /api/chat streaming (NDJSON) */
export class OllamaProvider implements LlmProvider {
  readonly meta = META;

  constructor(
    private readonly model: string = META.defaultModel,
    private readonly baseUrl: string = "http://localhost:11434"
  ) {}

  async validate(): Promise<string | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      if (!resp.ok) return `Ollama not reachable at ${this.baseUrl} (HTTP ${resp.status})`;
      return null;
    } catch {
      return `Ollama not reachable at ${this.baseUrl}. Is it running?`;
    }
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamEvent> {
    const url = `${this.baseUrl}/api/chat`;

    const messages: Array<{ role: string; content: string }> = [];
    if (req.systemPrompt) {
      messages.push({ role: "system", content: req.systemPrompt });
    }
    for (const m of req.messages) {
      if (m.role !== "system") {
        messages.push({ role: m.role, content: m.content });
      }
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          options: req.maxTokens ? { num_predict: req.maxTokens } : undefined,
        }),
      });
    } catch (err: unknown) {
      yield {
        type: "error",
        error: `Ollama fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      return;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      yield { type: "error", error: `Ollama error ${resp.status}: ${text}` };
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

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
            const event = JSON.parse(trimmed) as {
              message?: { content?: string };
              done?: boolean;
            };
            const chunk = event.message?.content ?? "";
            if (chunk) yield { type: "token", token: chunk };
          } catch {
            // ignore
          }
        }
      }
    } catch (err: unknown) {
      yield {
        type: "error",
        error: `Stream read error: ${err instanceof Error ? err.message : String(err)}`,
      };
      return;
    } finally {
      reader.releaseLock();
    }

    yield { type: "done" };
  }

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      if (!resp.ok) return [this.model];
      const data = (await resp.json()) as { models?: Array<{ name?: string }> };
      return data.models?.map((m) => m.name ?? "").filter(Boolean) ?? [this.model];
    } catch {
      return [this.model];
    }
  }
}
