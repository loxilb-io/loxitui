import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { LoxilbTuiConfigSchema, type ValidatedConfig } from "./schema";
import { DEFAULT_CONFIG, type LoxilbTuiConfig } from "./types";

const GLOBAL_CONFIG_PATH = join(homedir(), ".config", "loxitui", "config.toml");
const PROJECT_CONFIG_PATH = join(process.cwd(), ".loxitui", "config.toml");

async function readTomlFile(path: string): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(path, "utf8");
    return parseToml(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function loadConfig(overrides?: Partial<LoxilbTuiConfig>): Promise<ValidatedConfig> {
  const envPath = process.env.LOXILB_CONFIG_PATH;
  const primaryPath = envPath ? envPath : GLOBAL_CONFIG_PATH;
  const global = await readTomlFile(primaryPath);
  const project = envPath ? {} : await readTomlFile(PROJECT_CONFIG_PATH);

  const merged = deepMerge(
    deepMerge(deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, global), project),
    (overrides ?? {}) as Record<string, unknown>
  );

  const result = LoxilbTuiConfigSchema.safeParse(merged);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Config validation failed:\n${errors}`);
  }

  // Tilde expansion for audit.log_path
  const data = result.data;
  if (data.audit.log_path.startsWith("~/")) {
    data.audit.log_path = resolve(homedir(), data.audit.log_path.slice(2));
  }

  return data;
}

export async function writeConfig(path: string, cfg: Partial<LoxilbTuiConfig>): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const text = stringifyToml(cfg as Record<string, unknown>);
  await writeFile(path, text, "utf8");
}

export { GLOBAL_CONFIG_PATH };
export type { ValidatedConfig };
export * from "./types";
export * from "./schema";
