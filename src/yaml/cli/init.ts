import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Directory structure for yaml init scaffolding.
 * Keys are directory names, values are descriptions for README.md files.
 */
const INIT_DIRS: Record<string, string> = {
  env: "Environment-specific values files (values-dev.yaml, values-prod.yaml)",
  core: "Load balancers, endpoints, sessions",
  network: "Routes, IPv4/IPv6 addresses, neighbors, FDB, VLANs, VxLAN tunnels",
  security: "Firewalls, IP filters, security rate limits",
  bgp: "BGP global config, neighbors, policy sets, definitions",
  ipsec: "IPsec tunnels, certificates, CA certificates, configs",
  "ai-gateway": "AI API keys, tenant rate limits",
  observability: "BFD, policies, mirrors",
  system: "Params, CORS, SNI certificates, TLS certs, OPA watchers",
};

function printInitHelp(): void {
  console.log(`yaml init - Create a new config directory structure

Usage:
  loxitui yaml init [path] [options]

Arguments:
  path          Target directory (default: ./loxilb-config)

Options:
  --force       Initialize even if directory is not empty
  --help        Show this help message
`);
}

/**
 * Scaffold a conventional YAML config directory structure.
 *
 * @param args - CLI arguments after 'yaml init'
 * @param jsonMode - When true, suppress console output and return CliResult
 * @returns Exit code (0 = success, 1 = error), or CliResult when jsonMode is true
 */
export async function runInitCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | { exitCode: number; data?: unknown; errors?: string[] }> {
  // Parse flags
  const flags = new Set<string>();
  let targetDir = "./loxilb-config";
  for (const arg of args) {
    if (arg === "--force") {
      flags.add("force");
    } else if (arg === "--help" || arg === "-h") {
      if (jsonMode) {
        return { exitCode: 0, data: { help: true } };
      }
      printInitHelp();
      return 0;
    } else if (!arg.startsWith("--")) {
      targetDir = arg;
    }
  }

  // Check if target directory exists and is non-empty
  if (existsSync(targetDir)) {
    try {
      const entries = readdirSync(targetDir);
      if (entries.length > 0 && !flags.has("force")) {
        const msg = `Directory '${targetDir}' is not empty. Use --force to initialize anyway.`;
        if (jsonMode) {
          return { exitCode: 1, errors: [msg] };
        }
        console.error(msg);
        return 1;
      }
    } catch {
      // If we can't read it, try to create it
    }
  }

  // Create root directory
  mkdirSync(targetDir, { recursive: true });

  // Create subdirectories and READMEs
  const created: string[] = [];
  for (const [dirName, description] of Object.entries(INIT_DIRS)) {
    const dirPath = join(targetDir, dirName);
    mkdirSync(dirPath, { recursive: true });
    created.push(dirName);

    const readmePath = join(dirPath, "README.md");
    if (!existsSync(readmePath)) {
      writeFileSync(
        readmePath,
        `# ${dirName}\n\n${description}\n\nPlace your .yaml configuration files here.\n`
      );
    }
  }

  if (jsonMode) {
    return { exitCode: 0, data: { directory: targetDir, created } };
  }

  console.log(`Initialized config directory at ${targetDir}`);
  console.log("");
  console.log("Created directories:");
  for (const dir of created) {
    console.log(`  ${dir}/`);
  }

  return 0;
}
