/** Streaming event emitted by LlmProvider.stream() */
export interface StreamEvent {
  type: "token" | "done" | "error" | "tool_use" | "tool_result";
  token?: string;
  error?: string;
  /** Name of the MCP tool being called or whose result is returned */
  toolName?: string;
  /** Serialised input arguments for a tool_use event */
  toolInput?: string;
  /** Serialised result payload for a tool_result event */
  toolResult?: string;
}

/** Chat message exchanged with the LLM */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Request payload for LlmProvider.stream() */
export interface InferenceRequest {
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Metadata describing a provider's capabilities */
export interface ProviderMeta {
  id: string;
  displayName: string;
  defaultModel: string;
  contextWindow: number;
  supportStream: boolean;
  requiresApiKey: boolean;
  apiKeyEnvVar: string;
  docsUrl: string;
}

/** Uniform interface implemented by all LLM providers */
export interface LlmProvider {
  meta: ProviderMeta;
  /** Validate provider configuration. Returns null if valid, error message if not. */
  validate(): Promise<string | null>;
  /** Stream a chat completion as an async generator of StreamEvents. */
  stream(req: InferenceRequest): AsyncGenerator<StreamEvent>;
  /** List available models from the provider. */
  listModels(): Promise<string[]>;
}
