import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AnthropicProvider } from "../src/ai/provider/anthropic";
import { GeminiProvider } from "../src/ai/provider/gemini";
import { OpenAiProvider } from "../src/ai/provider/openai";
import { OpenAiChatProvider } from "../src/ai/provider/openai-chat";
import { sseData } from "../src/ai/provider/sse";
import type { InferenceRequest, LlmProvider, StreamEvent } from "../src/ai/provider/types";
import { LoxilbApi } from "../src/api";

const GATEWAY = "http://h:11111/netlox/v1";
const LOG_TOOL = "mcp__loxilb__get_logs";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

let calls: Call[];
/** Provider responses, served in order; gateway requests are answered separately. */
let replies: Response[];
const origFetch = global.fetch;

beforeEach(() => {
  calls = [];
  replies = [];
  global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith(GATEWAY)) {
      return new Response(JSON.stringify({ logs: ["line one", "line two"] }), { status: 200 });
    }
    calls.push({
      url: target,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request to ${target}`);
    return reply;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = origFetch;
});

const api = () => new LoxilbApi({ host: "h", port: 11111, tls: false, token: "" });

/** An event stream delivered in small pieces, so events straddle chunk boundaries. */
function sse(events: unknown[], pieceSize = 17): Response {
  const text = events
    .map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`)
    .join("");
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += pieceSize) {
        controller.enqueue(bytes.slice(i, i + pieceSize));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(provider: LlmProvider, req: Partial<InferenceRequest> = {}) {
  const events: StreamEvent[] = [];
  const gen = provider.stream({ messages: [{ role: "user", content: "show the logs" }], ...req });
  for await (const event of gen) events.push(event);
  return events;
}

const text = (events: StreamEvent[]) =>
  events
    .filter((e) => e.type === "token")
    .map((e) => e.token)
    .join("");

describe("sseData", () => {
  const read = async (body: string) => {
    const out: string[] = [];
    for await (const data of sseData(new Response(body))) out.push(data);
    return out;
  };

  it("yields one payload per event and skips event names and comments", async () => {
    expect(await read('event: a\ndata: {"x":1}\n\n: keep-alive\n\ndata: two\n\n')).toEqual([
      '{"x":1}',
      "two",
    ]);
  });

  it("joins multi-line data and accepts CRLF line endings", async () => {
    expect(await read("data: one\r\ndata: two\r\n\r\n")).toEqual(["one\ntwo"]);
  });

  it("keeps a final event that has no trailing blank line", async () => {
    expect(await read("data: first\n\ndata: last")).toEqual(["first", "last"]);
  });
});

describe("OpenAiProvider", () => {
  const provider = () => new OpenAiProvider({ api: api(), apiKey: "sk-test" });
  const textDelta = (delta: string) => ({ type: "response.output_text.delta", delta });
  const itemDone = (item: Record<string, unknown>) => ({ type: "response.output_item.done", item });
  const completed = { type: "response.completed", response: { status: "completed" } };

  it("streams text from the Responses API with the key, the default model and the tools", async () => {
    replies.push(sse([textDelta("Hel"), textDelta("lo"), completed]));
    const events = await collect(provider(), { systemPrompt: "be brief", maxTokens: 20 });

    expect(text(events)).toBe("Hello");
    expect(events.at(-1)).toEqual({ type: "done" });
    const [call] = calls;
    expect(call?.url).toBe("https://api.openai.com/v1/responses");
    expect(call?.headers.Authorization).toBe("Bearer sk-test");
    expect(call?.body).toMatchObject({
      model: "gpt-6.2-astra",
      instructions: "be brief",
      max_output_tokens: 4096,
      store: false,
      include: ["reasoning.encrypted_content"],
      input: [{ type: "message", role: "user", content: "show the logs" }],
    });
    const tools = call?.body.tools as Array<{ type: string; name: string; strict: boolean }>;
    // Left out, strict defaults to true and the optional parameters become required
    expect(tools.find((t) => t.name === LOG_TOOL)).toMatchObject({
      type: "function",
      strict: false,
    });
  });

  it("sends reasoning and call items back unchanged with the tool output", async () => {
    const reasoning = { type: "reasoning", id: "rs_1", encrypted_content: "opaque", summary: [] };
    const fnCall = {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: LOG_TOOL,
      arguments: '{"count":2}',
      status: "completed",
    };
    replies.push(
      sse([itemDone(reasoning), itemDone(fnCall), completed]),
      sse([textDelta("Two lines."), completed])
    );

    const events = await collect(provider());

    expect(events.map((e) => e.type)).toEqual(["tool_use", "tool_result", "token", "done"]);
    expect(events[0]).toMatchObject({ toolName: LOG_TOOL, toolInput: '{"count":2}' });
    const input = calls[1]?.body.input as Array<Record<string, unknown>>;
    expect(input.slice(1, 3)).toEqual([reasoning, fnCall]);
    expect(input[3]).toMatchObject({ type: "function_call_output", call_id: "call_1" });
    expect(input[3]?.output).toContain("line one");
  });

  it("reports an HTTP error, a failed response, a truncated answer and an empty one", async () => {
    replies.push(new Response("bad key", { status: 401 }));
    expect((await collect(provider())).at(-1)?.error).toContain("401: bad key");

    replies.push(
      sse([{ type: "response.failed", response: { error: { message: "overloaded" } } }])
    );
    expect((await collect(provider())).at(-1)?.error).toContain("overloaded");

    replies.push(
      sse([
        {
          type: "response.incomplete",
          response: { incomplete_details: { reason: "max_output_tokens" } },
        },
      ])
    );
    expect((await collect(provider())).at(-1)?.error).toContain("output token limit");

    replies.push(sse([completed]));
    expect((await collect(provider())).at(-1)?.error).toContain("empty answer");
  });

  it("does not run a tool call the token limit cut off", async () => {
    replies.push(
      sse([
        itemDone({ type: "function_call", call_id: "c1", name: LOG_TOOL, arguments: '{"cou' }),
        {
          type: "response.incomplete",
          response: { incomplete_details: { reason: "max_output_tokens" } },
        },
      ])
    );
    const events = await collect(provider());

    expect(events.map((e) => e.type)).toEqual(["error"]);
    expect(events[0]?.error).toContain("output token limit");
  });

  it("ends quietly when the caller cancels while the model is silent", async () => {
    let requestSignal: AbortSignal | undefined;
    global.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const cancel = new AbortController();
    const pending = collect(provider(), { signal: cancel.signal });
    await new Promise((resolve) => setTimeout(resolve, 10));
    cancel.abort();

    expect(await pending).toEqual([]);
    expect(requestSignal?.aborted).toBe(true);
  });

  it("stops when the model never finishes calling tools", async () => {
    for (let i = 0; i < 10; i++) {
      replies.push(
        sse([
          itemDone({ type: "function_call", call_id: `c${i}`, name: LOG_TOOL, arguments: "{}" }),
          completed,
        ])
      );
    }
    const events = await collect(provider());
    expect(calls).toHaveLength(10);
    expect(events.at(-1)?.error).toContain("10 rounds");
  });

  it("validates the key before the first question", async () => {
    expect(await new OpenAiProvider({ api: api(), apiKey: "" }).validate()).toContain(
      "OPENAI_API_KEY"
    );
    replies.push(new Response("", { status: 401 }));
    expect(await provider().validate()).toContain("rejected the API key");
    replies.push(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    expect(await provider().validate()).toBeNull();
  });
});

describe("OpenAiChatProvider", () => {
  const delta = (d: Record<string, unknown>, finish: string | null = null) => ({
    choices: [{ delta: d, finish_reason: finish }],
  });
  const provider = (apiKey = "") =>
    new OpenAiChatProvider({
      api: api(),
      apiKey,
      model: "local-model",
      baseUrl: "http://localhost:8000/v1/",
    });

  it("streams text from a compatible server, with or without a key", async () => {
    replies.push(sse([delta({ content: "Hel" }), delta({ content: "lo" }, "stop"), "[DONE]"]));
    const events = await collect(provider(), { systemPrompt: "be brief", disableTools: true });

    expect(text(events)).toBe("Hello");
    expect(events.at(-1)).toEqual({ type: "done" });
    const [call] = calls;
    expect(call?.url).toBe("http://localhost:8000/v1/chat/completions");
    expect(call?.headers.Authorization).toBeUndefined();
    expect(call?.body).toMatchObject({ model: "local-model", max_tokens: 4096 });
    expect(call?.body.tools).toBeUndefined();
    expect(call?.body.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "show the logs" },
    ]);

    replies.push(sse([delta({ content: "ok" }, "stop"), "[DONE]"]));
    await collect(provider("secret"));
    expect(calls[1]?.headers.Authorization).toBe("Bearer secret");
    const tools = calls[1]?.body.tools as Array<{ function: { name: string } }>;
    expect(tools.map((t) => t.function.name)).toContain(LOG_TOOL);
  });

  it("runs a tool call split across chunks and returns what the server attached to it", async () => {
    const call = (fields: Record<string, unknown>) =>
      delta({ tool_calls: [{ index: 0, ...fields }] });
    replies.push(
      sse([
        call({
          id: "call_1",
          type: "function",
          function: { name: LOG_TOOL, arguments: "" },
          extra_content: { signature: "sig" },
        }),
        call({ function: { arguments: '{"cou' } }),
        call({ function: { arguments: 'nt": 2}' } }),
        delta({}, "tool_calls"),
        "[DONE]",
      ]),
      sse([delta({ content: "Two lines." }, "stop"), "[DONE]"])
    );

    const events = await collect(provider());

    expect(events.map((e) => e.type)).toEqual(["tool_use", "tool_result", "token", "done"]);
    expect(events[0]).toMatchObject({ toolName: LOG_TOOL, toolInput: '{"count": 2}' });
    expect(events[1]?.toolResult).toContain("line one");
    const followUp = calls[1]?.body.messages as Array<Record<string, unknown>>;
    expect(followUp.at(-2)).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          extra_content: { signature: "sig" },
          id: "call_1",
          type: "function",
          function: { name: LOG_TOOL, arguments: '{"count": 2}' },
        },
      ],
    });
    expect(followUp.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });

  it("keeps two calls apart when the server sends no index", async () => {
    const call = (id: string, args: string) =>
      delta({
        tool_calls: [{ id, type: "function", function: { name: LOG_TOOL, arguments: args } }],
      });
    replies.push(
      sse([
        call("call_a", '{"count":1}'),
        call("call_b", '{"count":2}'),
        delta({}, "tool_calls"),
        "[DONE]",
      ]),
      sse([delta({ content: "Done." }, "stop"), "[DONE]"])
    );

    const events = await collect(provider());

    expect(events.filter((e) => e.type === "tool_use").map((e) => e.toolInput)).toEqual([
      '{"count":1}',
      '{"count":2}',
    ]);
    const followUp = calls[1]?.body.messages as Array<Record<string, unknown>>;
    expect(followUp.slice(-2).map((m) => m.tool_call_id)).toEqual(["call_a", "call_b"]);
  });

  it("tells the model when a call's arguments are not valid JSON instead of running it", async () => {
    const broken = { index: 0, id: "c1", function: { name: LOG_TOOL, arguments: '{"count": ' } };
    replies.push(
      sse([delta({ tool_calls: [broken] }, "tool_calls"), "[DONE]"]),
      sse([delta({ content: "Retrying." }, "stop"), "[DONE]"])
    );

    const events = await collect(provider());

    expect(events.map((e) => e.type)).toEqual(["tool_use", "tool_result", "token", "done"]);
    expect(events[1]?.toolResult).toContain("not valid JSON");
    const followUp = calls[1]?.body.messages as Array<Record<string, unknown>>;
    expect(followUp.at(-1)?.content).toContain("was not run");
  });

  it("does not run a call that lacks a required argument", async () => {
    const name = "mcp__loxilb__get_ai_user_rate_limits";
    const bare = { index: 0, id: "c1", function: { name, arguments: "{}" } };
    replies.push(
      sse([delta({ tool_calls: [bare] }, "tool_calls"), "[DONE]"]),
      sse([delta({ content: "Which tenant?" }, "stop"), "[DONE]"])
    );

    const events = await collect(provider());

    expect(events[1]?.toolResult).toContain("it needs tenant_id");
  });

  it("reports a stream error, a truncated answer and an empty one", async () => {
    replies.push(sse([{ error: { message: "overloaded" } }]));
    expect((await collect(provider())).at(-1)?.error).toContain("overloaded");

    replies.push(sse([delta({}, "length"), "[DONE]"]));
    expect((await collect(provider())).at(-1)?.error).toContain("output token limit");

    const cutCall = { index: 0, id: "c1", function: { name: LOG_TOOL, arguments: '{"cou' } };
    replies.push(sse([delta({ tool_calls: [cutCall] }, "length"), "[DONE]"]));
    expect((await collect(provider())).map((e) => e.type)).toEqual(["error"]);

    replies.push(sse([delta({}, "stop"), "[DONE]"]));
    expect((await collect(provider())).at(-1)?.error).toContain("empty answer");
  });

  it("validates that a model is set and the server answers", async () => {
    const unset = new OpenAiChatProvider({ api: api(), apiKey: "", baseUrl: "http://x/v1" });
    expect(await unset.validate()).toContain("[ai] model");
    // Not every compatible server lists its models
    replies.push(new Response("", { status: 404 }));
    expect(await provider().validate()).toBeNull();
    replies.push(new Response("", { status: 401 }));
    expect(await provider().validate()).toContain("rejected the API key");
  });
});

describe("AnthropicProvider", () => {
  const provider = () => new AnthropicProvider({ api: api(), apiKey: "sk-ant-test" });
  const start = (index: number, block: Record<string, unknown>) => ({
    type: "content_block_start",
    index,
    content_block: block,
  });
  const blockDelta = (index: number, d: Record<string, unknown>) => ({
    type: "content_block_delta",
    index,
    delta: d,
  });
  const stop = (index: number) => ({ type: "content_block_stop", index });
  const end = (reason: string) => [
    { type: "message_delta", delta: { stop_reason: reason } },
    { type: "message_stop" },
  ];

  it("streams text with the version header and a cap that leaves room to think", async () => {
    replies.push(
      sse([
        { type: "message_start", message: {} },
        { type: "ping" },
        start(0, { type: "text", text: "" }),
        blockDelta(0, { type: "text_delta", text: "Hel" }),
        blockDelta(0, { type: "text_delta", text: "lo" }),
        stop(0),
        ...end("end_turn"),
      ])
    );

    const events = await collect(provider(), { systemPrompt: "be brief", maxTokens: 2048 });

    expect(text(events)).toBe("Hello");
    expect(events.at(-1)).toEqual({ type: "done" });
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers["x-api-key"]).toBe("sk-ant-test");
    expect(call?.headers["anthropic-version"]).toBe("2026-10-21");
    expect(call?.body.model).toBe("claude-opus-5-5");
    expect(call?.body.max_tokens).toBe(16_000);
    expect(call?.body.system).toBe("be brief");
    expect(call?.body.temperature).toBeUndefined();
    const tools = call?.body.tools as Array<{ name: string; input_schema: unknown }>;
    expect(tools.find((t) => t.name === LOG_TOOL)?.input_schema).toBeDefined();
  });

  it("leaves out a message that is only whitespace", async () => {
    replies.push(sse(end("end_turn")));

    await collect(provider(), {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "\n\n" },
        { role: "user", content: "show the logs" },
      ],
    });

    expect(calls[0]?.body.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "show the logs" },
    ]);
  });

  it("returns thinking blocks unchanged with the tool results", async () => {
    replies.push(
      sse([
        start(0, { type: "thinking", thinking: "", signature: "" }),
        blockDelta(0, { type: "thinking_delta", thinking: "need logs" }),
        blockDelta(0, { type: "signature_delta", signature: "sig-abc" }),
        stop(0),
        start(1, { type: "tool_use", id: "toolu_1", name: LOG_TOOL, input: {} }),
        blockDelta(1, { type: "input_json_delta", partial_json: '{"cou' }),
        blockDelta(1, { type: "input_json_delta", partial_json: 'nt": 2}' }),
        stop(1),
        ...end("tool_use"),
      ]),
      sse([
        start(0, { type: "text", text: "" }),
        blockDelta(0, { type: "text_delta", text: "Two lines." }),
        stop(0),
        ...end("end_turn"),
      ])
    );

    const events = await collect(provider());

    expect(events.map((e) => e.type)).toEqual(["tool_use", "tool_result", "token", "done"]);
    expect(events[0]).toMatchObject({ toolName: LOG_TOOL, toolInput: '{"count":2}' });
    const followUp = calls[1]?.body.messages as Array<{ role: string; content: unknown }>;
    expect(followUp.at(-2)).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "need logs", signature: "sig-abc" },
        { type: "tool_use", id: "toolu_1", name: LOG_TOOL, input: { count: 2 } },
      ],
    });
    const results = followUp.at(-1)?.content as Array<Record<string, unknown>>;
    expect(followUp.at(-1)?.role).toBe("user");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(results[0]?.content).toContain("line one");
  });

  it("marks a call whose input is not valid JSON as an error instead of running it", async () => {
    replies.push(
      sse([
        start(0, { type: "tool_use", id: "toolu_1", name: LOG_TOOL, input: {} }),
        blockDelta(0, { type: "input_json_delta", partial_json: '{"count": ' }),
        stop(0),
        ...end("tool_use"),
      ]),
      sse([
        start(0, { type: "text", text: "" }),
        blockDelta(0, { type: "text_delta", text: "Retrying." }),
        stop(0),
        ...end("end_turn"),
      ])
    );

    await collect(provider());

    const followUp = calls[1]?.body.messages as Array<{ role: string; content: unknown }>;
    expect(followUp.at(-2)?.content).toEqual([
      { type: "tool_use", id: "toolu_1", name: LOG_TOOL, input: {} },
    ]);
    const [result] = followUp.at(-1)?.content as Array<Record<string, unknown>>;
    expect(result).toMatchObject({ tool_use_id: "toolu_1", is_error: true });
    expect(result?.content).toContain("was not run");
  });

  it("reports a refusal, a stream error, an HTTP error and an empty answer", async () => {
    replies.push(sse([...end("refusal")]));
    expect((await collect(provider())).at(-1)?.error).toContain("declined");

    replies.push(sse([{ type: "error", error: { type: "overloaded_error", message: "busy" } }]));
    expect((await collect(provider())).at(-1)?.error).toContain("busy");

    replies.push(new Response("no credit", { status: 400 }));
    expect((await collect(provider())).at(-1)?.error).toContain("400: no credit");

    replies.push(sse([...end("end_turn")]));
    expect((await collect(provider())).at(-1)?.error).toContain("empty answer");
  });

  it("validates the key before the first question", async () => {
    expect(await new AnthropicProvider({ api: api(), apiKey: "" }).validate()).toContain(
      "ANTHROPIC_API_KEY"
    );
    replies.push(new Response("", { status: 401 }));
    expect(await provider().validate()).toContain("rejected the API key");
  });
});

describe("GeminiProvider", () => {
  const provider = () => new GeminiProvider({ api: api(), apiKey: "g-test" });
  const ev = (event_type: string, rest: Record<string, unknown> = {}) => ({ event_type, ...rest });
  const finished = (status: string) => ev("interaction.completed", { interaction: { status } });

  it("streams text from a stateless interaction", async () => {
    replies.push(
      sse([
        ev("interaction.created", { interaction: { status: "in_progress" } }),
        ev("step.start", { index: 0, step: { type: "thought" } }),
        ev("step.delta", { index: 0, delta: { type: "thought_signature", signature: "sig" } }),
        ev("step.stop", { index: 0 }),
        ev("step.start", { index: 1, step: { type: "model_output" } }),
        ev("step.delta", { index: 1, delta: { type: "text", text: "Hel" } }),
        ev("step.delta", { index: 1, delta: { type: "text", text: "lo" } }),
        ev("step.stop", { index: 1 }),
        finished("completed"),
      ])
    );

    const events = await collect(provider(), { systemPrompt: "be brief", maxTokens: 2048 });

    expect(text(events)).toBe("Hello");
    expect(events.at(-1)).toEqual({ type: "done" });
    const [call] = calls;
    expect(call?.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(call?.headers["x-goog-api-key"]).toBe("g-test");
    expect(call?.body).toMatchObject({
      model: "gemini-4-hydrogen",
      system_instruction: "be brief",
      generation_config: { max_output_tokens: 16_000 },
      store: false,
      input: [{ type: "user_input", content: [{ type: "text", text: "show the logs" }] }],
    });
    const tools = call?.body.tools as Array<{ type: string; name: string }>;
    expect(tools.find((t) => t.name === LOG_TOOL)?.type).toBe("function");
  });

  it("returns thought steps unchanged with the function result", async () => {
    replies.push(
      sse([
        ev("step.start", { index: 0, step: { type: "thought" } }),
        ev("step.delta", { index: 0, delta: { type: "thought_signature", signature: "sig-abc" } }),
        ev("step.stop", { index: 0 }),
        ev("step.start", {
          index: 1,
          step: { type: "function_call", id: "fc1", name: LOG_TOOL, arguments: {} },
        }),
        ev("step.delta", { index: 1, delta: { type: "arguments_delta", arguments: '{"cou' } }),
        ev("step.delta", { index: 1, delta: { type: "arguments_delta", arguments: 'nt":2}' } }),
        ev("step.stop", { index: 1 }),
        finished("requires_action"),
      ]),
      sse([
        ev("step.start", { index: 0, step: { type: "model_output" } }),
        ev("step.delta", { index: 0, delta: { type: "text", text: "Two lines." } }),
        ev("step.stop", { index: 0 }),
        finished("completed"),
      ])
    );

    const events = await collect(provider(), {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "show the logs" },
      ],
    });

    expect(events.map((e) => e.type)).toEqual(["tool_use", "tool_result", "token", "done"]);
    expect(events[0]).toMatchObject({ toolName: LOG_TOOL, toolInput: '{"count":2}' });
    const input = calls[1]?.body.input as Array<Record<string, unknown>>;
    expect(input[1]).toEqual({ type: "model_output", content: [{ type: "text", text: "hello" }] });
    expect(input.slice(3, 5)).toEqual([
      { type: "thought", signature: "sig-abc" },
      { type: "function_call", id: "fc1", name: LOG_TOOL, arguments: { count: 2 } },
    ]);
    expect(input[5]).toMatchObject({ type: "function_result", name: LOG_TOOL, call_id: "fc1" });
    const result = input[5]?.result as Array<{ type: string; text: string }>;
    expect(result[0]?.text).toContain("line one");
  });

  it("reports a stream error, an HTTP error, a truncated answer and an empty one", async () => {
    replies.push(sse([ev("error", { error: { message: "high demand", code: "unavailable" } })]));
    expect((await collect(provider())).at(-1)?.error).toContain("high demand");

    replies.push(new Response("quota", { status: 429 }));
    expect((await collect(provider())).at(-1)?.error).toContain("429: quota");

    replies.push(sse([finished("incomplete")]));
    expect((await collect(provider())).at(-1)?.error).toContain("output token limit");

    replies.push(sse([finished("completed")]));
    expect((await collect(provider())).at(-1)?.error).toContain("empty answer");
  });

  it("validates the key before the first question", async () => {
    expect(await new GeminiProvider({ api: api(), apiKey: "" }).validate()).toContain(
      "GEMINI_API_KEY"
    );
    replies.push(new Response("", { status: 400 }));
    expect(await provider().validate()).toContain("rejected the API key");
  });
});
