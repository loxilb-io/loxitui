import * as fs from "node:fs/promises";
import * as path from "node:path";
import readline from "node:readline";
import { ANTHROPIC_DEFAULT_MODEL } from "@/ai/provider/anthropic";
import { GEMINI_DEFAULT_MODEL } from "@/ai/provider/gemini";
import { OPENAI_DEFAULT_MODEL } from "@/ai/provider/openai";
import type { ProviderName } from "@/ai/provider/registry";
import { DEFAULT_CONFIG, GLOBAL_CONFIG_PATH, writeConfig } from "@/config";

interface SetupAnswers {
  host: string;
  port: number;
  tls: boolean;
  token: string;
  provider: ProviderName;
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** Providers reached over an HTTP API with a key */
const API_PROVIDERS = {
  openai: { model: OPENAI_DEFAULT_MODEL, keyEnv: "OPENAI_API_KEY" },
  anthropic: { model: ANTHROPIC_DEFAULT_MODEL, keyEnv: "ANTHROPIC_API_KEY" },
  gemini: { model: GEMINI_DEFAULT_MODEL, keyEnv: "GEMINI_API_KEY" },
} as const;

type RlInterface = ReturnType<typeof readline.createInterface>;

function question(rl: RlInterface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function prompt(rl: RlInterface, q: string, fallback: string): Promise<string> {
  const answer = await question(rl, q);
  return answer.trim() || fallback;
}

async function promptBool(rl: RlInterface, q: string, fallback: boolean): Promise<boolean> {
  const answer = (await question(rl, q)).trim().toLowerCase();
  if (answer === "") return fallback;
  return answer === "y" || answer === "yes";
}

async function promptNumber(rl: RlInterface, q: string, fallback: number): Promise<number> {
  const answer = await question(rl, q);
  const parsed = Number.parseInt(answer.trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nWelcome to loxitui setup!\n");
  console.log("This wizard configures your connection to a LoxiLB instance and AI provider.\n");

  const answers: SetupAnswers = {
    host: await prompt(
      rl,
      `LoxiLB host [${DEFAULT_CONFIG.loxilb.host}]: `,
      DEFAULT_CONFIG.loxilb.host
    ),
    port: await promptNumber(
      rl,
      `LoxiLB port [${DEFAULT_CONFIG.loxilb.port}]: `,
      DEFAULT_CONFIG.loxilb.port
    ),
    tls: await promptBool(
      rl,
      `Use TLS? [${DEFAULT_CONFIG.loxilb.tls ? "Y/n" : "y/N"}]: `,
      DEFAULT_CONFIG.loxilb.tls
    ),
    token: await prompt(rl, "LoxiLB API token (leave blank to skip): ", ""),
    provider: (await prompt(
      rl,
      "AI provider (claude-cli/ollama/openai/anthropic/gemini) [claude-cli]: ",
      "claude-cli"
    )) as SetupAnswers["provider"],
    apiKey: "",
    model: "",
    baseUrl: "",
  };

  // Provider-specific prompts
  if (answers.provider === "ollama") {
    answers.baseUrl = await prompt(
      rl,
      "Ollama base URL [http://localhost:11434]: ",
      "http://localhost:11434"
    );
    answers.model = await prompt(rl, "Model [llama3.2]: ", "llama3.2");
  } else if (answers.provider in API_PROVIDERS) {
    const { model, keyEnv } = API_PROVIDERS[answers.provider as keyof typeof API_PROVIDERS];
    if (answers.provider === "openai") {
      answers.baseUrl = await prompt(
        rl,
        "Base URL of an OpenAI-compatible server, e.g. http://localhost:8000/v1 (leave blank for OpenAI): ",
        ""
      );
    }
    // Another server serves its own models; the OpenAI default would not exist there.
    // Left blank, the model stays unset and doctor asks for it.
    answers.model = answers.baseUrl
      ? await prompt(rl, "Model (as the server names it): ", DEFAULT_CONFIG.ai.model)
      : await prompt(rl, `Model [${model}]: `, model);
    answers.apiKey = answers.baseUrl
      ? await prompt(rl, "API key (leave blank if the server needs none): ", "")
      : await prompt(rl, `API key (leave blank to use ${keyEnv}): `, "");
  } else {
    // claude-cli: no prompts for key or model needed
    answers.model = "sonnet";
  }

  rl.close();

  const cfg = {
    loxilb: {
      host: answers.host,
      port: answers.port,
      tls: answers.tls,
      token: answers.token,
      username: DEFAULT_CONFIG.loxilb.username,
      password: DEFAULT_CONFIG.loxilb.password,
    },
    ai: {
      provider: answers.provider,
      api_key: answers.apiKey,
      model: answers.model,
      base_url: answers.baseUrl || DEFAULT_CONFIG.ai.base_url,
      knowledge_base_path: DEFAULT_CONFIG.ai.knowledge_base_path,
      max_history_turns: DEFAULT_CONFIG.ai.max_history_turns,
      summary_threshold: DEFAULT_CONFIG.ai.summary_threshold,
    },
    metrics: DEFAULT_CONFIG.metrics,
    ui: DEFAULT_CONFIG.ui,
  };

  const configDir = path.dirname(GLOBAL_CONFIG_PATH);
  await fs.mkdir(configDir, { recursive: true });
  await writeConfig(GLOBAL_CONFIG_PATH, cfg);

  console.log(`\nConfiguration saved to: ${GLOBAL_CONFIG_PATH}`);
  console.log("Run `loxitui` to start the TUI.\n");
}
