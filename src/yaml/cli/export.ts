/**
 * CLI command: yaml export [--kind <kind>] [--name <name>] [--output <dir>] [--all]
 *
 * Exports live LoxiLB configuration as domain-organized YAML files.
 * Returns exit code 0 on success, 1 on failure.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LoxilbApi } from "@/api/index.js";
import { loadConfig } from "@/config/index.js";
import { exportResources } from "../export/exporter.js";
import type { CliResult } from "./types.js";

// Import adapters to ensure registration
import "../adapters/index.js";

/**
 * Parse CLI flags from args array.
 */
function parseFlags(args: string[]) {
  const flags = {
    kind: undefined as string | undefined,
    name: undefined as string | undefined,
    outputDir: undefined as string | undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--kind" && i + 1 < args.length) {
      flags.kind = args[++i];
    } else if (arg === "--name" && i + 1 < args.length) {
      flags.name = args[++i];
    } else if ((arg === "--output" || arg === "-o") && i + 1 < args.length) {
      flags.outputDir = args[++i];
    } else if (arg === "--all") {
      // Explicit flag for clarity — default behavior
    } else if (!arg.startsWith("--") && !arg.startsWith("-") && !flags.outputDir) {
      flags.outputDir = arg;
    }
  }

  return flags;
}

/**
 * Run the export CLI command.
 * @returns Exit code (0 = success, 1 = failure)
 */
export async function runExportCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  const flags = parseFlags(args);

  if (flags.help) {
    if (jsonMode) {
      return { exitCode: 0, data: { help: true } };
    }
    console.log("Usage: yaml export [options] [output-dir]");
    console.log("");
    console.log("Options:");
    console.log("  --kind <kind>       Export only the specified resource kind");
    console.log("  --name <name>       Export only the resource matching the identity key");
    console.log("  --output, -o <dir>  Output directory (default: current directory)");
    console.log("  --all               Export all configurable kinds (default)");
    console.log("  --help, -h          Show this help message");
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
  } catch {
    console.error("No configuration found. Run 'loxitui setup' first.");
    return 1;
  }

  // Export resources
  const result = await exportResources(api, {
    kind: flags.kind,
    name: flags.name,
  });

  if (result.files.length === 0 && result.errors.length > 0) {
    console.error("Export failed. All kinds returned errors:");
    for (const err of result.errors) {
      console.error(`  ${err}`);
    }
    return 1;
  }

  if (result.files.length === 0) {
    console.log("No resources found to export.");
    return 0;
  }

  // Write files to disk
  const outputDir = resolve(flags.outputDir ?? ".");

  for (const file of result.files) {
    const domainDir = join(outputDir, file.domainGroup);
    mkdirSync(domainDir, { recursive: true });

    const filePath = join(domainDir, file.fileName);
    writeFileSync(filePath, file.content, "utf-8");

    if (!jsonMode) {
      console.log(`  ${file.domainGroup}/${file.fileName} (${file.resourceCount} resources)`);
    }
  }

  if (jsonMode) {
    return {
      exitCode: 0,
      data: {
        files: result.files.map((f) => ({
          path: `${f.domainGroup}/${f.fileName}`,
          kind: f.kind,
          domain: f.domainGroup,
          resourceCount: f.resourceCount,
        })),
        totalResources: result.totalResources,
        totalKinds: result.totalKinds,
      },
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    };
  }

  console.log("");
  console.log(
    `Exported ${result.totalResources} resources across ${result.totalKinds} kinds to ${outputDir}`
  );

  // Print any errors
  if (result.errors.length > 0) {
    console.warn("");
    console.warn("Warnings:");
    for (const err of result.errors) {
      console.warn(`  ${err}`);
    }
  }

  return 0;
}
