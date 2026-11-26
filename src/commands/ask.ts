import { ProviderRegistry } from "@/ai/provider/registry";
import { getAuditLogger } from "@/audit";
import { loadConfig } from "@/config";
import type { ValidatedConfig } from "@/config";

export async function runAsk(args: string[], preloadedConfig?: ValidatedConfig): Promise<void> {
  const query = args[0];
  if (!query || query.trim().length === 0) {
    console.error('Usage: loxitui ask "<question>"');
    process.exit(1);
  }

  let cfg: ValidatedConfig;
  if (preloadedConfig) {
    cfg = preloadedConfig;
  } else {
    try {
      cfg = await loadConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Config error: ${msg}`);
      process.exit(1);
    }
  }

  const registry = new ProviderRegistry();
  const provider = await registry.createDefault(cfg.ai, cfg.loxilb);

  const validationError = await provider.validate();
  if (validationError) {
    process.stderr.write(`${validationError}\n`);
    process.exit(3);
  }

  // The same records the sidebar writes, so the log shows which provider a question went to
  const audit = getAuditLogger();
  audit.log({
    event: "ai.query",
    component: "ai",
    data: {
      provider: provider.meta.id,
      model: provider.meta.defaultModel,
      query: query.slice(0, 200),
      history_turns: 0,
    },
  });

  const t0 = Date.now();
  let hadError = false;
  for await (const event of provider.stream({
    messages: [{ role: "user", content: query }],
    maxTokens: 2048,
  })) {
    if (event.type === "token" && event.token) {
      process.stdout.write(event.token);
    } else if (event.type === "error") {
      process.stderr.write(`${event.error}\n`);
      audit.log({
        event: "ai.error",
        level: "ERROR",
        component: "ai",
        ms: Date.now() - t0,
        data: { provider: provider.meta.id, error: event.error ?? "Unknown provider error" },
      });
      hadError = true;
      break;
    }
  }

  process.stdout.write("\n");
  if (!hadError) {
    audit.log({
      event: "ai.response",
      component: "ai",
      ms: Date.now() - t0,
      data: { provider: provider.meta.id, status: "ok" },
    });
  }
  audit.log({
    event: "cmd.dispatch",
    component: "cmd",
    data: {
      verb: "ask",
      resource: "ai",
      args_count: 1,
      ok: !hadError,
      message: hadError ? "ai provider error" : "ok",
    },
  });
  if (hadError) {
    // process.exit drops the records still being written
    await audit.flush();
    process.exit(2);
  }
}
