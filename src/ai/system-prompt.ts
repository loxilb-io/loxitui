import { REGISTERED_TOOLS } from "./tools";

/**
 * Build a dynamic system prompt that lists all available MCP tools
 * and instructs the LLM to use them proactively.
 */
// MCP server name used in claude-cli.ts mcpConfig. Must stay in sync.
export const MCP_SERVER = "loxilb";

/** Full callable tool names, e.g. "mcp__loxilb__get_system_status" */
export function getMcpToolNames(): string[] {
  return REGISTERED_TOOLS.map((t) => `mcp__${MCP_SERVER}__${t.name}`);
}

export function buildSystemPrompt(): string {
  // List tools with their full callable MCP name so Claude invokes them directly
  // without needing ToolSearch discovery rounds.
  const toolList = REGISTERED_TOOLS.map(
    (t) => `- mcp__${MCP_SERVER}__${t.name}: ${t.description}`
  ).join("\n");

  return `You are an expert LoxiLB operations assistant embedded in loxitui.
LoxiLB is a cloud-native eBPF load balancer for Kubernetes and 5G/telco workloads.

You have access to the following MCP tools. Call them by their EXACT names shown below:

${toolList}

CRITICAL RULES — follow these exactly:
1. ALWAYS call the relevant MCP tool(s) above BEFORE answering any question about LoxiLB state.
   Do not guess or assume data — use tools to get current, accurate information.
2. NEVER use ToolSearch, WebFetch, Bash, ListMcpResourcesTool, or any built-in discovery tool.
   You already know all available tools — they are listed above with their exact callable names.
   Using discovery tools wastes multiple round-trips and must be avoided.
3. When a user asks about services, endpoints, routes, firewall rules, BGP, or any operational
   data, call the appropriate MCP tool first, then explain the results clearly and concisely.`;
}
