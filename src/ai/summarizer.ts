/**
 * Conversation summarizer for the AI sidebar.
 *
 * When the accumulated message history approaches the provider's context window,
 * this module compresses older turns into a single dense summary — preserving
 * key facts, tool results, and decisions — so that multi-turn conversations can
 * continue indefinitely without hitting token limits.
 */

import type { AiMessage } from "@/tui/state";
import type { AiClient } from "./client";

/** Rough estimate: average English token ≈ 4 characters */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate total tokens consumed by a list of messages.
 * Uses character count / 4 as a cheap approximation.
 */
export function estimateTokens(messages: Pick<AiMessage, "content">[]): number {
  const total = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(total / CHARS_PER_TOKEN);
}

/**
 * Returns true when the accumulated history exceeds `threshold` fraction of
 * the provider's context window, indicating that summarization should run.
 *
 * @param messages  Current chat history
 * @param contextWindow  Provider's maximum context window in tokens
 * @param threshold  Fraction at which to trigger (default 0.7 = 70 %)
 */
export function needsSummary(
  messages: AiMessage[],
  contextWindow: number,
  threshold = 0.7
): boolean {
  return estimateTokens(messages) > Math.floor(contextWindow * threshold);
}

/**
 * Summarise all messages in `messages` into a single compact assistant message.
 *
 * The resulting message can be stored at the front of the history array so the
 * model retains semantic context while staying within the context window.
 *
 * Tool_use and tool_result entries are included as prose so that facts
 * discovered via MCP tools are not lost.
 */
export async function summarizeHistory(
  messages: AiMessage[],
  client: AiClient
): Promise<AiMessage> {
  const transcript = messages
    .map((m) => {
      if (m.role === "tool_use") return `[Tool Call: ${m.toolName ?? "unknown"}] ${m.content}`;
      if (m.role === "tool_result") return `[Tool Result: ${m.toolName ?? "unknown"}] ${m.content}`;
      const label = m.role === "user" ? "User" : "Assistant";
      return `${label}: ${m.content}`;
    })
    .join("\n\n");

  const prompt = `Summarize the following conversation concisely. Preserve key facts, operational data discovered via tools, and important decisions. Output a single dense paragraph prefixed with "[Summary] ".

${transcript}`;

  let summary = "";
  await client.stream({
    messages: [{ role: "user", content: prompt }],
    systemPrompt:
      "You are a conversation summarizer. Respond with only the summary paragraph, no extra text.",
    onChunk: (chunk) => {
      summary += chunk;
    },
  });

  return {
    role: "assistant",
    content: summary.trim() || "[Summary] (Compression failed — previous context may be lost)",
    ts: Date.now(),
  };
}
