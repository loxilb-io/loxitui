import { AiClient } from "@/ai/client";
import { ContextBuilder } from "@/ai/context";
import { findRelevantKnowledge } from "@/ai/knowledge-matcher";
import type { ProviderMeta } from "@/ai/provider/types";
import { SKILL_MAP, getSystemPrompt, selectSkillAsync } from "@/ai/skills";
import { estimateTokens, needsSummary, summarizeHistory } from "@/ai/summarizer";
import { buildSystemPrompt } from "@/ai/system-prompt";
import { getAuditLogger } from "@/audit";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MarkdownContent } from "../components/MarkdownContent";
import { type AiMessage, useApp } from "../state";
import { colors, layout } from "../theme";

const SIDEBAR_W = layout.sidebar.width;
const SCROLL_STEP = 3;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Maps slash commands to the agent skill key they should invoke */
const SLASH_COMMAND_MAP: Record<string, string> = {
  "/k8s": "loxilb-kubernetes",
  "/kube": "loxilb-kubernetes",
  "/kubernetes": "loxilb-kubernetes",
  "/ebpf": "loxilb-ebpf",
  "/debug": "loxilb-troubleshooting",
  "/troubleshoot": "loxilb-troubleshooting",
  "/ts": "loxilb-troubleshooting",
  "/bgp": "loxilb-bgp-networking",
  "/network": "loxilb-bgp-networking",
  "/cli": "loxicmd-agent",
  "/cmd": "loxicmd-agent",
  "/loxicmd": "loxicmd-agent",
  "/proto": "loxilb-protocols",
  "/protocols": "loxilb-protocols",
};

const SLASH_COMMAND_HELP = `Available slash commands:
- /k8s, /kube, /kubernetes — Kubernetes integration expert
- /ebpf — eBPF datapath internals
- /debug, /troubleshoot, /ts — Diagnostic workflows
- /bgp, /network — BGP networking configuration
- /cli, /cmd, /loxicmd — CLI command reference
- /proto, /protocols — Protocol support (SCTP, GTP, NAT64/66)
- /help, /? — Show this help

Usage: /k8s How do I configure service annotations?`;

function AnimatedSpinner(): ReactNode {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return <text fg={colors.accent.ai}>{SPINNER_FRAMES[frame]}</text>;
}

/** Compact horizontal bar showing estimated context window usage */
function ContextBar({
  used,
  total,
  width,
}: {
  used: number;
  total: number;
  width: number;
}): ReactNode {
  const pct = Math.min(1, used / total);
  const pctDisplay = Math.round(pct * 100);
  // Use ASCII chars only — block chars (U+2588/U+2591) don't render in all terminal fonts
  const barWidth = Math.max(4, width - 14);
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const bar = "#".repeat(filled) + "-".repeat(empty);
  const fg =
    pct > 0.85 ? colors.status.error : pct > 0.6 ? colors.status.warning : colors.fg.secondary;
  return <text fg={fg}>{`Ctx: [${bar}] ${pctDisplay}%`}</text>;
}

function MessageBubble({
  role,
  content,
  width,
  isStreaming,
  toolName,
  skillName,
  ts,
}: {
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  width: number;
  isStreaming?: boolean;
  toolName?: string;
  skillName?: string;
  ts?: number;
}): ReactNode {
  const isUser = role === "user";
  const isTool = role === "tool_use" || role === "tool_result";
  const innerW = width - 6;

  const timestamp = ts
    ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isTool) {
    const icon = role === "tool_use" ? "[>]" : "[v]";
    // Strip mcp__loxilb__ prefix and truncate so timestamp fits on the same line.
    // Header budget: innerW(sidebarW-8) minus icon(3) + gap(1) + prefix(5) + timestamp(8) + gap(1) = 18
    const rawName = toolName?.replace(/^mcp__[^_]+__/, "") ?? "";
    const maxNameLen = Math.max(6, innerW - 18);
    const shortName =
      rawName.length > maxNameLen ? `${rawName.slice(0, maxNameLen - 1)}…` : rawName;
    const label = role === "tool_use" ? `Tool: ${shortName}` : `Done: ${shortName}`;
    return (
      <box
        style={{
          flexDirection: "column",
          marginBottom: 1,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: colors.bg.secondary,
          border: true,
          borderColor: colors.border.normal,
        }}
      >
        <box style={{ flexDirection: "row", justifyContent: "space-between", width: innerW }}>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={colors.accent.secondary}>{icon}</text>
            <text fg={colors.fg.secondary}>{label}</text>
          </box>
          {timestamp && <text fg={colors.fg.muted}>{timestamp}</text>}
        </box>
        {content.length > 0 && (
          <text fg={colors.fg.muted} style={{ width: innerW }}>
            {content.length > 120 ? `${content.slice(0, 120)}...` : content}
          </text>
        )}
      </box>
    );
  }

  return (
    <box
      style={{
        flexDirection: "column",
        marginBottom: 1,
        marginLeft: isUser ? 2 : 0,
        marginRight: isUser ? 0 : 2,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: isUser ? colors.bg.tertiary : colors.bg.panel,
        border: true,
        borderColor: isUser ? colors.accent.primary : colors.border.normal,
      }}
    >
      {/* Role label + timestamp row */}
      <box style={{ flexDirection: "row", justifyContent: "space-between", width: innerW }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={isUser ? colors.accent.primary : colors.accent.ai}>
            {isUser ? "You" : "LoxiLB AI"}
          </text>
          {skillName && !isUser && (
            <text fg={colors.fg.muted}>[{skillName.replace("loxilb-", "")}]</text>
          )}
          {isStreaming && <AnimatedSpinner />}
        </box>
        {timestamp && <text fg={colors.fg.muted}>{timestamp}</text>}
      </box>
      {/* Content — show placeholder when streaming hasn't produced text yet */}
      {content.length > 0 ? (
        isUser ? (
          <text fg={colors.fg.primary} style={{ width: innerW }}>
            {content}
          </text>
        ) : (
          <MarkdownContent content={content} width={innerW} />
        )
      ) : (
        isStreaming && (
          <text fg={colors.fg.secondary} style={{ width: innerW }}>
            Thinking...
          </text>
        )
      )}
    </box>
  );
}

/** AI sidebar panel. Keyboard input is captured when ai sidebar is open. */
export function AiSidebar({
  height,
  width: sidebarW,
  visible,
}: {
  height: number;
  width: number;
  visible: boolean;
}): ReactNode {
  const { state, actions } = useApp();
  const inputRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const clientRef = useRef<AiClient | null>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  // Stable refs so streamToSidebar doesn't capture state/actions in its closure,
  // preventing a cascade of closure recreations on every streaming token.
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const ctxBuilderRef = useRef(new ContextBuilder());
  const [validationError, setValidationError] = useState<string | null>(null);
  const hasValidated = useRef(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [summaryBanner, setSummaryBanner] = useState(false);
  const [providerMeta, setProviderMeta] = useState<ProviderMeta | null>(null);

  // Keep refs current every render (runs before any callbacks execute)
  stateRef.current = state;
  actionsRef.current = actions;

  if (!clientRef.current) {
    clientRef.current = new AiClient({ config: state.config });
  }
  const client = clientRef.current;

  // Validate provider on first sidebar open; also load provider metadata
  useEffect(() => {
    if (!visible || hasValidated.current) return;
    hasValidated.current = true;
    client.validate().then((err) => {
      if (err) setValidationError(err);
    });
    client
      .getProviderMeta()
      .then(setProviderMeta)
      .catch(() => {});
  }, [visible, client]);

  const streamToSidebar = useCallback(
    async (
      userMessage: string,
      extraSystemContext?: string,
      historyOverride?: AiMessage[],
      skillOverride?: string
    ) => {
      const st = stateRef.current;
      const act = actionsRef.current;
      if (st.aiStreaming) return;

      // Block further submissions immediately
      act.setAiStreaming(true);
      setActiveToolCall(null);

      // Phase 4: Resolve provider meta (needed for context window threshold check)
      const provMeta = await client.getProviderMeta();

      // Phase 4: Compress history if we're approaching the context window limit
      let workingHistory = historyOverride ?? stateRef.current.aiMessages;
      if (
        needsSummary(
          workingHistory,
          provMeta.contextWindow,
          stateRef.current.config.ai.summary_threshold ?? 0.7
        )
      ) {
        setSummaryBanner(true);
        try {
          const summary = await summarizeHistory(workingHistory, client);
          // Preserve the last 2 full turns (4 messages) alongside the summary
          const lastTurns = workingHistory
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-4);
          const newHistory = [summary, ...lastTurns];
          getAuditLogger().log({
            event: "ai.compression",
            component: "ai",
            data: {
              before_msgs: workingHistory.length,
              after_msgs: newHistory.length,
              estimated_tokens: estimateTokens(workingHistory),
            },
          });
          actionsRef.current.replaceAiMessages(newHistory);
          workingHistory = newHistory;
        } catch {
          // Non-fatal: continue without summarisation
        }
        setTimeout(() => setSummaryBanner(false), 5000);
      }

      // Add the new user message + streaming placeholder
      act.pushAiMessage({ role: "user", content: userMessage });
      act.pushAiMessage({
        role: "assistant",
        content: "",
        ...(skillOverride ? { skillName: skillOverride } : {}),
      });

      // Build fresh system prompt with current live state.
      // buildSystemPrompt() is used here (not getSystemPrompt) because it includes the
      // full MCP tool list with explicit instructions to use them — without this, Claude
      // falls back to WebFetch/Bash for API access, causing significant overhead.
      const ctx = ctxBuilderRef.current.build(stateRef.current);

      // Route the query: use skillOverride when provided (slash commands),
      // otherwise run keyword + LLM classifier routing.
      let skillKey: string;
      let matchedKeywords: string[];
      let skillConfidence: number;
      let skillSource: string;

      if (skillOverride) {
        skillKey = skillOverride;
        matchedKeywords = [];
        skillConfidence = 1.0;
        skillSource = "slash_command";
      } else {
        const result = await selectSkillAsync(userMessage, (q) => client.classifySkill(q));
        skillKey = result.skillKey;
        matchedKeywords = result.matchedKeywords;
        skillConfidence = result.confidence;
        skillSource = result.source;
      }

      const selectedSkill = SKILL_MAP[skillKey] ?? SKILL_MAP.default;
      getAuditLogger().log({
        event: "ai.skill_selected",
        component: "ai",
        data: {
          skill: skillKey,
          description: selectedSkill?.description ?? skillKey,
          matched_keywords: matchedKeywords,
          confidence: Math.round(skillConfidence * 1000) / 1000,
          source: skillSource,
        },
      });

      const skillContent = getSystemPrompt(skillKey);
      const mcpPrompt = buildSystemPrompt();
      // Inject knowledge docs matched to the user query into the system prompt.
      // This runs independently of skill routing so both features compose cleanly.
      const knowledgeCtx = await findRelevantKnowledge(userMessage);
      // Merge: MCP tool prompt → skill content → matched knowledge → live state context
      let systemPrompt = `${mcpPrompt}\n\n${skillContent}`;
      if (knowledgeCtx) {
        systemPrompt += `\n\n## Relevant Knowledge Base\n\n${knowledgeCtx}`;
      }
      systemPrompt += `\n\n${ctx}`;
      if (extraSystemContext) {
        systemPrompt = `${extraSystemContext}\n\n${systemPrompt}`;
      }

      // Only send user/assistant messages to the LLM (tool event records are UI-only)
      // Phase 2 fix: slice by maxTurns * 2 (messages, not turns)
      const maxTurns = stateRef.current.config.ai.max_history_turns ?? 10;
      const messages = workingHistory
        .filter((m) => m.content.length > 0 && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        .slice(-(maxTurns * 2))
        .concat([{ role: "user" as const, content: userMessage }]);

      abortRef.current = new AbortController();

      // MCP tool results travel over the MCP stdio protocol between claude CLI and
      // the MCP subprocess — they do NOT appear as events in the JSONL stream we parse.
      // So onToolEvent("tool_result") never fires, meaning no fresh assistant placeholder
      // is pushed, and the first text token ends up appended to the last tool_use bubble.
      //
      // Fix: track whether we've seen a tool_use since the last text output.
      // On the first onChunk call after one or more tool_use events, push a fresh
      // assistant placeholder first before appending the chunk.
      let awaitingAssistantPlaceholder = false;

      try {
        await client.stream({
          messages,
          systemPrompt,
          onChunk: (chunk) => {
            if (awaitingAssistantPlaceholder) {
              awaitingAssistantPlaceholder = false;
              actionsRef.current.pushAiMessage({ role: "assistant", content: "" });
            }
            actionsRef.current.updateAiLastMessage(chunk);
          },
          // Phase 3: record tool call/result as distinct chat bubbles.
          // tool_result may or may not arrive depending on claude CLI stream format;
          // awaitingAssistantPlaceholder handles the case where it doesn't.
          onToolEvent: (type, toolName, content) => {
            if (type === "tool_use") {
              awaitingAssistantPlaceholder = true;
              setActiveToolCall(toolName);
              actionsRef.current.pushAiMessage({ role: "tool_use", content, toolName });
            } else {
              awaitingAssistantPlaceholder = false;
              setActiveToolCall(null);
              actionsRef.current.pushAiMessage({
                role: "tool_result",
                content: content.slice(0, 500),
                toolName,
              });
              // Fresh assistant placeholder for text that follows the tool result
              actionsRef.current.pushAiMessage({ role: "assistant", content: "" });
            }
          },
          signal: abortRef.current.signal,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "AI error";
        actionsRef.current.updateAiLastMessage(`\n[Error: ${msg}]`);
      } finally {
        actionsRef.current.setAiStreaming(false);
        setActiveToolCall(null);
      }
    },
    [client] // client is stable (set once via clientRef guard); stateRef/actionsRef are refs
  );

  const handleSubmit = useCallback(async () => {
    const input = inputRef.current.trim();
    if (!input || stateRef.current.aiStreaming) return;

    inputRef.current = "";
    actionsRef.current.setAiInput("");

    if (input.startsWith("/")) {
      const parts = input.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const query = parts.slice(1).join(" ");

      if (cmd === "/help" || cmd === "/?") {
        actionsRef.current.pushAiMessage({ role: "user", content: input });
        actionsRef.current.pushAiMessage({ role: "assistant", content: SLASH_COMMAND_HELP });
        return;
      }

      const skillName = SLASH_COMMAND_MAP[cmd];
      if (!skillName) {
        actionsRef.current.pushAiMessage({ role: "user", content: input });
        actionsRef.current.pushAiMessage({
          role: "assistant",
          content: `Unknown command: ${cmd}\n\n${SLASH_COMMAND_HELP}`,
        });
        return;
      }

      const effectiveQuery = query || `Explain ${cmd.slice(1)} in the context of LoxiLB`;
      await streamToSidebar(effectiveQuery, undefined, undefined, skillName);
      return;
    }

    await streamToSidebar(input);
  }, [streamToSidebar]);

  // Ctrl+R: regenerate the last assistant response
  const handleRegenerateLastResponse = useCallback(async () => {
    if (stateRef.current.aiStreaming) return;
    const msgs = stateRef.current.aiMessages;
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    // Drop the last assistant bubble so it gets replaced by the fresh response
    const withoutLastAssistant = msgs.at(-1)?.role === "assistant" ? msgs.slice(0, -1) : msgs;
    actionsRef.current.replaceAiMessages(withoutLastAssistant);
    await streamToSidebar(lastUserMsg.content, undefined, withoutLastAssistant);
  }, [streamToSidebar]);

  // Handle pending log analysis from App.tsx 'l' key press
  useEffect(() => {
    if (!state.pendingLogAnalysis || state.aiStreaming) return;
    const logCtx = state.pendingLogAnalysis;
    actionsRef.current.setPendingLogAnalysis(null);
    void streamToSidebar("Analyze the current log entries for errors and anomalies.", logCtx);
  }, [state.pendingLogAnalysis, state.aiStreaming, streamToSidebar]);

  useKeyboard(
    useCallback(
      (key: { name: string; sequence?: string; ctrl?: boolean }) => {
        if (!visible) return;
        if (key.name === "return") {
          void handleSubmit();
        } else if (key.name === "up") {
          scrollRef.current?.scrollBy(-SCROLL_STEP);
        } else if (key.name === "down") {
          scrollRef.current?.scrollBy(SCROLL_STEP);
        } else if (key.name === "pageup") {
          scrollRef.current?.scrollBy(-20);
        } else if (key.name === "pagedown") {
          scrollRef.current?.scrollBy(20);
        } else if (key.name === "backspace") {
          const cur = inputRef.current;
          if (cur.length > 0) {
            inputRef.current = cur.slice(0, -1);
            actions.setAiInput(inputRef.current);
          }
        } else if (key.ctrl && key.name === "c") {
          abortRef.current?.abort();
          actions.setAiStreaming(false);
        } else if (key.ctrl && key.name === "l") {
          // Phase 5: clear history
          actionsRef.current.replaceAiMessages([]);
          actions.showStatusMessage("AI history cleared");
        } else if (key.ctrl && key.name === "r") {
          // Phase 6d: regenerate last response
          void handleRegenerateLastResponse();
        } else if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
          inputRef.current += key.sequence;
          actions.setAiInput(inputRef.current);
        }
      },
      [visible, handleSubmit, handleRegenerateLastResponse, actions]
    )
  );

  if (!visible) return null;

  const msgs = state.aiMessages;
  const isStreaming = state.aiStreaming;

  return (
    <box
      style={{
        width: sidebarW,
        height,
        flexDirection: "column",
        backgroundColor: colors.bg.panel,
        border: true,
        borderColor: isStreaming ? colors.accent.ai : colors.border.normal,
      }}
    >
      {/* Header row 1: title + provider/model */}
      <box
        style={{
          height: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: colors.bg.tertiary,
        }}
      >
        <text fg={colors.accent.ai}>[AI] LoxiLB Assistant</text>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={colors.fg.secondary}>
            {providerMeta
              ? `${providerMeta.id}/${providerMeta.defaultModel}`
              : state.config.ai.provider}
          </text>
          {isStreaming && <AnimatedSpinner />}
        </box>
      </box>
      {/* Header row 2: context window fill bar (only once provider meta loads) */}
      {providerMeta && (
        <box
          style={{
            height: 1,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: colors.bg.tertiary,
          }}
        >
          <ContextBar
            used={estimateTokens(msgs)}
            total={providerMeta.contextWindow}
            width={sidebarW - 4}
          />
        </box>
      )}

      {/* Validation error banner */}
      {validationError && (
        <box style={{ paddingLeft: 1, paddingRight: 1 }}>
          <text fg={colors.status.error}>{validationError}</text>
        </box>
      )}

      {/* Phase 6b: Summarisation notification banner */}
      {summaryBanner && (
        <box style={{ paddingLeft: 1, paddingRight: 1, backgroundColor: colors.bg.tertiary }}>
          <text fg={colors.accent.ai}>ⓘ Conversation compressed — older context summarised</text>
        </box>
      )}

      {/* Messages area — scrollbox handles mouse wheel + sticky-to-bottom */}
      <scrollbox
        ref={scrollRef}
        style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}
        stickyScroll={true}
        stickyStart="bottom"
      >
        {msgs.length === 0 && !isStreaming && (
          <box style={{ paddingTop: 1, paddingLeft: 1 }}>
            <text fg={colors.fg.secondary}>Ask about LB services, endpoints,</text>
            <text fg={colors.fg.secondary}>connections, BGP, firewall rules...</text>
            <text> </text>
            <text fg={colors.fg.muted}>Up/Down or scroll to navigate history</text>
          </box>
        )}
        {msgs.map((msg, i) => {
          const isLastAssistant = isStreaming && i === msgs.length - 1 && msg.role === "assistant";
          // Skip empty intermediate assistant placeholders (appear between tool calls)
          if (msg.content.length === 0 && !isLastAssistant) return null;
          return (
            <MessageBubble
              key={i}
              role={msg.role}
              content={msg.content}
              width={sidebarW - 2}
              isStreaming={isLastAssistant}
              toolName={msg.toolName}
              skillName={msg.skillName}
              ts={msg.ts}
            />
          );
        })}
      </scrollbox>

      {/* Phase 6c: Active tool call indicator */}
      {activeToolCall && (
        <box style={{ paddingLeft: 1, paddingRight: 1 }}>
          <text fg={colors.fg.secondary}>
            {"[>] Calling: "}
            {activeToolCall}
            {"..."}
          </text>
        </box>
      )}

      {/* Input area — explicit height: 4 so the TUI framework reserves the right
           number of rows: top border + input row + hint row + bottom border.
           Width budget: sidebarW(42) - outer border(2) - input border(2) - input padding(2) = 36
           Use ASCII > instead of › (U+203A) — renders as "->" in some terminal fonts. */}
      <box
        style={{
          height: 4,
          flexDirection: "column",
          border: true,
          borderColor: isStreaming ? colors.border.normal : colors.accent.ai,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text style={{ width: sidebarW - 6 }}>
          <span fg={colors.accent.ai}>{"> "}</span>
          <span fg={isStreaming ? colors.fg.muted : colors.fg.primary}>{state.aiInput}</span>
          <span fg={isStreaming ? colors.fg.muted : colors.accent.ai}>
            {isStreaming ? "" : "█"}
          </span>
        </text>
        <text fg={colors.fg.muted} style={{ width: sidebarW - 6 }}>
          {isStreaming ? "Up/Down=scroll  ^C=stop" : "Enter=send  ^L=clear  ^R=retry  Esc"}
        </text>
      </box>
    </box>
  );
}
