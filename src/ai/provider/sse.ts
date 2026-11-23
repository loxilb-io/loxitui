/**
 * Yield the data payload of each event in a text/event-stream response.
 * Multi-line data fields are joined with "\n"; event names and comments are dropped.
 * Returning early from the consumer cancels the underlying request body.
 */
export async function* sseData(resp: Response): AsyncGenerator<string> {
  const reader = resp.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (line === "") {
          if (data.length > 0) yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(line[5] === " " ? 6 : 5));
        }
      }
    }
    // A stream that ends without a trailing blank line still carries its last event
    const tail = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
    if (tail.startsWith("data:")) data.push(tail.slice(tail[5] === " " ? 6 : 5));
    if (data.length > 0) yield data.join("\n");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
