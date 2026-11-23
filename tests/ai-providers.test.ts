import { describe, expect, it } from "bun:test";
import { sseData } from "../src/ai/provider/sse";

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
