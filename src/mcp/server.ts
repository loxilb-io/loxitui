import { appendFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { REGISTERED_TOOLS, executeTool } from "../ai/tools";
import { LoxilbApi } from "../api/index";

/**
 * Start the MCP stdio server that bridges REGISTERED_TOOLS to the MCP protocol.
 *
 * This process is spawned by Claude CLI as a child process. LoxiLB connection
 * params come from environment variables (set by the parent ClaudeCliProvider).
 *
 * CRITICAL: Never use console.log() here — stdout is the MCP transport.
 */
export async function startMcpServer(): Promise<void> {
  // Construct LoxilbApi from environment variables (MCP-02)
  const host = process.env.LOXILB_HOST ?? "127.0.0.1";
  const port = Number(process.env.LOXILB_PORT) || 11111;
  const tls = process.env.LOXILB_TLS === "true";
  const token = process.env.LOXILB_TOKEN ?? "";

  // Audit context from parent process (passed via env vars — US-006)
  // CRITICAL: Never use console.log/process.stdout.write — stdout is MCP transport.
  // Use fs.appendFileSync directly. Never import from src/audit/ here.
  const auditLogPath = process.env.LOXILB_AUDIT_LOG_PATH ?? "";
  const auditSession = (process.env.LOXILB_AUDIT_SESSION_ID ?? "00000000").slice(0, 8);

  function writeAuditEvent(
    event: string,
    component: string,
    data: Record<string, unknown>,
    ms?: number
  ): void {
    if (!auditLogPath) return;
    try {
      const record = JSON.stringify({
        ts: new Date().toISOString(),
        level: "INFO",
        session: auditSession,
        event,
        component,
        ms,
        data,
      });
      appendFileSync(auditLogPath, `${record}\n`);
    } catch {
      // Silently discard write errors — never crash the MCP server
    }
  }

  const api = new LoxilbApi({ host, port, tls, token });

  // ── Tool result cache ──────────────────────────────────────────────────────
  // Short-lived in-memory cache to deduplicate repeated tool calls within a
  // single conversation turn (e.g. Claude calling get_lb_services twice).
  // TTL is deliberately short (5 s) so data stays fresh for operators.
  interface CacheEntry {
    result: string;
    timestamp: number;
  }
  const TOOL_CACHE = new Map<string, CacheEntry>();
  const CACHE_TTL_MS = 5000;

  function getCacheKey(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const server = new McpServer({ name: "loxitui", version: "1.0.0" });

  // Register each tool from the registry
  for (const tool of REGISTERED_TOOLS) {
    // Convert inputSchema.properties to Zod shapes
    const zodShape: Record<string, z.ZodTypeAny> = {};

    const props = tool.inputSchema.properties;
    const required = tool.inputSchema.required ?? [];

    for (const [key, prop] of Object.entries(props)) {
      let schema: z.ZodTypeAny;

      if (prop.type === "number") {
        let numSchema = z.number().describe(prop.description);
        if (prop.default !== undefined) {
          numSchema = numSchema.default(prop.default as number) as unknown as z.ZodNumber;
        }
        schema = numSchema;
      } else {
        let strSchema = z.string().describe(prop.description);
        if (prop.default !== undefined) {
          strSchema = strSchema.default(prop.default as string) as unknown as z.ZodString;
        }
        schema = strSchema;
      }

      if (!required.includes(key)) {
        schema = schema.optional();
      }

      zodShape[key] = schema;
    }

    server.tool(tool.name, tool.description, zodShape, async (args: Record<string, unknown>) => {
      const argsSummary = Object.entries(args)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${String(v ?? "")}`)
        .join(",");

      // Cache check: return immediately if a fresh result exists
      const cacheKey = getCacheKey(tool.name, args);
      const cached = TOOL_CACHE.get(cacheKey);
      const now = Date.now();
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        writeAuditEvent("ai.tool_call", "mcp", {
          tool_name: tool.name,
          args_summary: argsSummary,
          cached: true,
        });
        return { content: [{ type: "text" as const, text: cached.result }] };
      }

      writeAuditEvent("ai.tool_call", "mcp", { tool_name: tool.name, args_summary: argsSummary });
      const t0 = Date.now();
      try {
        const result = await executeTool(tool.name, args, api);
        TOOL_CACHE.set(cacheKey, { result, timestamp: now });
        writeAuditEvent(
          "ai.tool_result",
          "mcp",
          { tool_name: tool.name, status: "ok" },
          Date.now() - t0
        );
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writeAuditEvent(
          "ai.tool_result",
          "mcp",
          { tool_name: tool.name, status: "error", error: msg },
          Date.now() - t0
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    });
  }

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[loxilb-mcp] MCP server started on stdio");
}
