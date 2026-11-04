import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiError, ApiResult, LoxilbApiClient } from "../src/api/client";
import { parseCommand } from "../src/cmd/parser";
import { dispatch } from "../src/tui/commands/dispatcher";

interface MockCall {
  method: string;
  path: string;
  body?: unknown;
}

function mockApi(opts: {
  responses?: Record<string, ApiResult<unknown>>;
  textResponses?: Record<string, { ok: true; text: string } | { ok: false; error: ApiError }>;
}): { client: LoxilbApiClient; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const handler = (method: string, p: string, body?: unknown) => {
    calls.push({ method, path: p, body });
    const key = `${method} ${p}`;
    return Promise.resolve(opts.responses?.[key] ?? { ok: true, data: undefined });
  };
  const client = {
    get: (p: string) => handler("GET", p),
    post: (p: string, body?: unknown) => handler("POST", p, body),
    del: (p: string, body?: unknown) => handler("DELETE", p, body),
    getText: (p: string) => {
      calls.push({ method: "GET(text)", path: p });
      return Promise.resolve(opts.textResponses?.[p] ?? { ok: true, text: "{}" });
    },
  } as unknown as LoxilbApiClient;
  return { client, calls };
}

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "loxitui-lifecycle-"));
});
afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("Dispatcher: lifecycle commands", () => {
  it("persist posts to /config/persist and reports path + checksum", async () => {
    const { client } = mockApi({
      responses: {
        "POST /config/persist": {
          ok: true,
          data: { result: "ok", path: "/etc/loxilb/snapshot.json", checksum: "abc123" },
        },
      },
    });
    const r = await dispatch(parseCommand("persist"), client);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("/etc/loxilb/snapshot.json");
    expect(r.message).toContain("abc123");
  });

  it("snapshot writes the raw document to the given file", async () => {
    const file = path.join(tmpDir, "snap.json");
    const doc = '{"schema_version":"1.0"}';
    const { client, calls } = mockApi({
      textResponses: { "/config/snapshot": { ok: true, text: doc } },
    });
    const r = await dispatch(parseCommand(`snapshot ${file}`), client);
    expect(r.ok).toBe(true);
    expect(r.message).toContain(file);
    expect(await readFile(file, "utf-8")).toBe(doc);
    expect(calls[0]?.path).toBe("/config/snapshot");
  });

  it("snapshot forwards --components as a query parameter", async () => {
    const file = path.join(tmpDir, "snap2.json");
    const { client, calls } = mockApi({
      textResponses: {
        "/config/snapshot?components=loadbalancer%2Cfirewall": { ok: true, text: "{}" },
      },
    });
    const r = await dispatch(
      parseCommand(`snapshot ${file} --components loadbalancer,firewall`),
      client
    );
    expect(r.ok).toBe(true);
    expect(calls[0]?.path).toBe("/config/snapshot?components=loadbalancer%2Cfirewall");
  });

  it("export writes the exported config to the given file", async () => {
    const file = path.join(tmpDir, "export.json");
    const { client } = mockApi({
      textResponses: { "/config/export": { ok: true, text: '{"lb":[]}' } },
    });
    const r = await dispatch(parseCommand(`export ${file}`), client);
    expect(r.ok).toBe(true);
    expect(await readFile(file, "utf-8")).toBe('{"lb":[]}');
  });

  it("restore without a file argument returns usage", async () => {
    const { client } = mockApi({});
    const r = await dispatch(parseCommand("restore"), client);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Usage: restore");
  });

  it("restore defaults to dry-run and summarizes the plan", async () => {
    const file = path.join(tmpDir, "restore-src.json");
    await writeFile(file, '{"schema_version":"1.0"}', "utf-8");
    const { client, calls } = mockApi({
      responses: {
        "POST /config/restore?mode=dry-run": {
          ok: true,
          data: {
            mode: "dry-run",
            compatible: true,
            plan: [
              { domain: "loadbalancer", to_apply: 5, to_delete: 1 },
              { domain: "firewall", to_apply: 0, to_delete: 0 },
            ],
          },
        },
      },
    });
    const r = await dispatch(parseCommand(`restore ${file}`), client);
    expect(r.ok).toBe(true);
    expect(calls[0]?.path).toBe("/config/restore?mode=dry-run");
    expect(calls[0]?.body).toEqual({ schema_version: "1.0" });
    expect(r.message).toContain("dry-run");
    expect(r.message).toContain("apply 5");
    expect(r.message).toContain("delete 1");
    expect(r.message).toContain("loadbalancer:+5/-1");
    expect(r.message).toContain("--commit");
  });

  it("restore --commit posts with mode=commit and reports the result", async () => {
    const file = path.join(tmpDir, "restore-commit.json");
    await writeFile(file, "{}", "utf-8");
    const { client, calls } = mockApi({
      responses: {
        "POST /config/restore?mode=commit": {
          ok: true,
          data: { mode: "commit", result: "ok", plan: [] },
        },
      },
    });
    const r = await dispatch(parseCommand(`restore ${file} --commit`), client);
    expect(r.ok).toBe(true);
    expect(calls[0]?.path).toBe("/config/restore?mode=commit");
    expect(r.message).toContain("restore commit: ok");
  });

  it("restore --commit reports failure when the gateway rolled back", async () => {
    const file = path.join(tmpDir, "restore-fail.json");
    await writeFile(file, "{}", "utf-8");
    const { client } = mockApi({
      responses: {
        "POST /config/restore?mode=commit": {
          ok: true,
          data: { mode: "commit", result: "rolled-back", plan: [], errors: ["apply failed"] },
        },
      },
    });
    const r = await dispatch(parseCommand(`restore ${file} --commit`), client);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("rolled-back");
    expect(r.message).toContain("apply failed");
  });

  it("restore with an unreadable file returns an error", async () => {
    const { client } = mockApi({});
    const r = await dispatch(parseCommand(`restore ${path.join(tmpDir, "missing.json")}`), client);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("cannot read");
  });
});
