/**
 * CLI command: yaml diff <path> [--values <file>] [--set KEY=VALUE...]
 *
 * Shows field-level differences between YAML resources and live API state
 * without making any changes. Exit code 0 = no changes, 1 = changes detected.
 */

import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { LoxilbApi } from "@/api/index.js";
import { loadConfig } from "@/config/index.js";
import { loadValuesFile, parseYamlFile } from "../parser.js";
import type { VariableContext } from "../parser.js";
import { calculateDiff } from "../reconciler/diff.js";
import type { YamlResource } from "../types.js";
import { validateDirectory, validateFile } from "../validator/index.js";
import type { CliResult } from "./types.js";

// Import adapters to ensure registration
import "../adapters/index.js";

/**
 * Parse CLI flags from args array.
 */
function parseFlags(args: string[]) {
  const flags = {
    valuesFile: undefined as string | undefined,
    setOverrides: {} as Record<string, string>,
    path: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--values" && i + 1 < args.length) {
      flags.valuesFile = args[++i];
    } else if (arg === "--set" && i + 1 < args.length) {
      const setValue = args[++i];
      const eqIdx = setValue.indexOf("=");
      if (eqIdx > 0) {
        flags.setOverrides[setValue.slice(0, eqIdx)] = setValue.slice(eqIdx + 1);
      }
    } else if (!arg.startsWith("--") && !arg.startsWith("-")) {
      flags.path = arg;
    }
  }

  return flags;
}

/**
 * Collect all YAML files from a directory recursively.
 */
function collectYamlFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(yaml|yml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

/**
 * Run the diff CLI command.
 * @returns Exit code (0 = no changes, 1 = changes detected or error)
 */
export async function runDiffCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  const flags = parseFlags(args);

  if (!flags.path) {
    const msg = "Usage: yaml diff <path> [--values <file>] [--set KEY=VALUE...]";
    if (jsonMode) {
      return { exitCode: 1, errors: [msg] };
    }
    console.error(msg);
    console.error("  <path>              Path to a .yaml/.yml file or directory");
    console.error("  --values <file>     Path to values file for variable substitution");
    console.error("  --set KEY=VALUE     Override variables (can appear multiple times)");
    return 1;
  }

  const targetPath = resolve(flags.path);

  // Build variable context
  const context: VariableContext = {
    setOverrides: flags.setOverrides,
    valuesFile: flags.valuesFile ? loadValuesFile(resolve(flags.valuesFile)) : {},
    env: process.env as Record<string, string | undefined>,
  };

  // Resolve and parse
  let resources: YamlResource[];
  try {
    const stat = statSync(targetPath);

    // Validate first
    if (stat.isDirectory()) {
      const validationResults = validateDirectory(targetPath);
      const hasErrors = validationResults.some(
        (r) => r.parseError || r.resources.some((res) => !res.valid)
      );
      if (hasErrors) {
        console.error("Validation failed. Fix errors before diffing.");
        for (const result of validationResults) {
          if (result.parseError) {
            console.error(`  ${result.filePath}: ${result.parseError}`);
          }
          for (const res of result.resources) {
            if (!res.valid) {
              console.error(`  ${res.kind} "${res.resourceName}":`);
              for (const err of res.errors) {
                console.error(`    ${err.fieldPath}: ${err.message}`);
              }
            }
          }
        }
        return 1;
      }

      // Parse all files
      const yamlFiles = collectYamlFiles(targetPath);
      resources = yamlFiles.flatMap((f) => parseYamlFile(f, context));
    } else {
      const validationResult = validateFile(targetPath);
      const hasErrors =
        validationResult.parseError || validationResult.resources.some((res) => !res.valid);
      if (hasErrors) {
        console.error("Validation failed. Fix errors before diffing.");
        if (validationResult.parseError) {
          console.error(`  Parse error: ${validationResult.parseError}`);
        }
        for (const res of validationResult.resources) {
          if (!res.valid) {
            console.error(`  ${res.kind} "${res.resourceName}":`);
            for (const err of res.errors) {
              console.error(`    ${err.fieldPath}: ${err.message}`);
            }
          }
        }
        return 1;
      }

      resources = parseYamlFile(targetPath, context);
    }
  } catch (err) {
    console.error(
      `Error: Cannot access path "${targetPath}": ${err instanceof Error ? err.message : err}`
    );
    return 1;
  }

  if (resources.length === 0) {
    console.log("No resources found in the specified path.");
    return 0;
  }

  // Build API instance
  let api: LoxilbApi;
  try {
    const config = await loadConfig();
    api = new LoxilbApi({
      host: config.loxilb.host,
      port: config.loxilb.port,
      tls: config.loxilb.tls,
      token: config.loxilb.token,
    });
  } catch (err) {
    console.error("No configuration found. Run 'loxitui setup' first.");
    return 1;
  }

  // Calculate diff
  const diffResults = await calculateDiff(resources, api);

  // Group by operation
  const unchanged = diffResults.filter((r) => r.operation === "UNCHANGED");
  const creates = diffResults.filter((r) => r.operation === "CREATE");
  const updates = diffResults.filter((r) => r.operation === "UPDATE");
  const deletes = diffResults.filter((r) => r.operation === "DELETE");

  const hasChanges = creates.length > 0 || updates.length > 0 || deletes.length > 0;

  if (jsonMode) {
    const exitCode = hasChanges ? 1 : 0;
    return {
      exitCode,
      data: {
        resources: diffResults.map((r) => ({
          kind: r.kind,
          name: r.name,
          action: r.operation,
          ...(r.operation === "UPDATE" && r.fieldDiffs
            ? {
                changes: Object.fromEntries(
                  r.fieldDiffs.map((fd) => [fd.path, { desired: fd.desired, actual: fd.live }])
                ),
              }
            : {}),
        })),
        totalChanges: creates.length + updates.length + deletes.length,
      },
    };
  }

  // Display results
  if (unchanged.length > 0) {
    for (const r of unchanged) {
      console.log(`  = ${r.kind}/${r.name}`);
    }
  }

  if (creates.length > 0) {
    for (const r of creates) {
      console.log(`  + ${r.kind}/${r.name}`);
    }
  }

  if (deletes.length > 0) {
    for (const r of deletes) {
      console.log(`  - ${r.kind}/${r.name}`);
    }
  }

  if (updates.length > 0) {
    for (const r of updates) {
      console.log(`  ~ ${r.kind}/${r.name}`);
      for (const fd of r.fieldDiffs) {
        console.log(
          `      ${fd.path}: ${JSON.stringify(fd.live)} -> ${JSON.stringify(fd.desired)}`
        );
      }
    }
  }

  // Summary
  console.log("");
  console.log(
    `${unchanged.length} unchanged, ${creates.length} to create, ` +
      `${updates.length} to update, ${deletes.length} to delete`
  );

  // Exit code: 0 = no changes (like diff), 1 = changes detected
  return hasChanges ? 1 : 0;
}
