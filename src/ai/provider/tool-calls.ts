import type { LoxilbApi } from "@/api/index";
import { MCP_SERVER } from "../system-prompt";
import { REGISTERED_TOOLS, type ToolDefinition, executeTool } from "../tools";

/**
 * API providers offer the tools under the names the system prompt and the skills
 * already use (mcp__loxilb__*), so one prompt serves them and the Claude CLI.
 */
const NAME_PREFIX = `mcp__${MCP_SERVER}__`;

/** Upper bound on model -> tool -> model round trips within one answer. */
export const MAX_TOOL_ROUNDS = 10;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: ToolDefinition["inputSchema"];
}

export interface ToolCall {
  id: string;
  name: string;
  /** Null when what the model sent was not a JSON object. */
  args: Record<string, unknown> | null;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

export function toolSpecs(): ToolSpec[] {
  return REGISTERED_TOOLS.map((t) => ({
    name: `${NAME_PREFIX}${t.name}`,
    description: t.description,
    parameters: t.inputSchema,
  }));
}

/** Tool arguments arrive as JSON text. An empty payload means none; null means it was not a JSON object. */
export function parseToolArgs(json: string): Record<string, unknown> | null {
  if (!json.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function runTool(call: ToolCall, api: LoxilbApi): Promise<ToolOutcome> {
  const name = call.name.startsWith(NAME_PREFIX) ? call.name.slice(NAME_PREFIX.length) : call.name;
  // Run with no arguments it would answer something the model did not ask
  if (!call.args) {
    return {
      content: `Tool ${name} was not run: its arguments were not valid JSON.`,
      isError: true,
    };
  }
  // The MCP server rejects a call that lacks a required argument; the tool itself does not check
  const required = REGISTERED_TOOLS.find((t) => t.name === name)?.inputSchema.required ?? [];
  const missing = required.filter((key) => call.args?.[key] == null);
  if (missing.length > 0) {
    return {
      content: `Tool ${name} was not run: it needs ${missing.join(", ")}.`,
      isError: true,
    };
  }
  try {
    return { content: await executeTool(name, call.args, api), isError: false };
  } catch (err: unknown) {
    return {
      content: `Tool ${name} failed: ${errorMessage(err)}`,
      isError: true,
    };
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
