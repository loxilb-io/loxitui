/**
 * CLI command: yaml validate <path> [--schema-only]
 *
 * Validates YAML resource files against schema and semantic rules.
 * Returns exit code 0 if all resources pass, 1 if any fail.
 */

import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { FileValidationResult } from "../types.js";
import { validateDirectory, validateFile } from "../validator/index.js";
import type { CliResult } from "./types.js";

/**
 * Run the validate CLI command.
 * @returns Exit code (0 = all pass, 1 = failures or error), or CliResult when jsonMode is true
 */
export async function runValidateCommand(
  args: string[],
  jsonMode?: boolean
): Promise<number | CliResult> {
  // Parse flags
  const schemaOnly = args.includes("--schema-only");
  const paths = args.filter((a) => !a.startsWith("--"));

  if (paths.length === 0) {
    const msg = "Usage: yaml validate <path> [--schema-only]";
    if (jsonMode) {
      return { exitCode: 1, errors: [msg] };
    }
    console.error(msg);
    console.error("  <path>          Path to a .yaml/.yml file or directory");
    console.error("  --schema-only   Skip semantic rules, run only JSON Schema validation");
    return 1;
  }

  const targetPath = resolve(paths[0]);
  const options = { schemaOnly };

  let fileResults: FileValidationResult[];

  try {
    const stat = statSync(targetPath);
    if (stat.isDirectory()) {
      fileResults = validateDirectory(targetPath, options);
    } else {
      fileResults = [validateFile(targetPath, options)];
    }
  } catch (err) {
    const msg = `Cannot access path "${targetPath}": ${err instanceof Error ? err.message : err}`;
    if (jsonMode) {
      return { exitCode: 1, errors: [msg] };
    }
    console.error(`Error: ${msg}`);
    return 1;
  }

  // Collect structured results
  let totalErrors = 0;
  const files: Array<{
    path: string;
    valid: boolean;
    errors: Array<{ resource: string; field: string; message: string; suggestion?: string }>;
  }> = [];

  let totalFiles = 0;
  let totalResources = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const fileResult of fileResults) {
    totalFiles++;
    const fileEntry: (typeof files)[0] = {
      path: fileResult.filePath,
      valid: true,
      errors: [],
    };

    if (!jsonMode) {
      console.log(`\n${fileResult.filePath}:`);
    }

    if (fileResult.parseError) {
      if (!jsonMode) {
        console.error(`  Parse error: ${fileResult.parseError}`);
      }
      fileEntry.valid = false;
      fileEntry.errors.push({ resource: "", field: "", message: fileResult.parseError });
      totalFailed++;
      totalErrors++;
      files.push(fileEntry);
      continue;
    }

    for (const resource of fileResult.resources) {
      totalResources++;
      if (resource.valid) {
        totalPassed++;
        if (!jsonMode) {
          console.log(`  \u2713 ${resource.kind} "${resource.resourceName}" \u2014 valid`);
        }
      } else {
        totalFailed++;
        fileEntry.valid = false;
        if (!jsonMode) {
          console.log(`  \u2717 ${resource.kind} "${resource.resourceName}":`);
        }
        for (const error of resource.errors) {
          totalErrors++;
          fileEntry.errors.push({
            resource: `${resource.kind}/${resource.resourceName}`,
            field: error.fieldPath ?? "",
            message: error.message,
            suggestion: error.suggestion,
          });
          if (!jsonMode) {
            const pathPrefix = error.fieldPath ? `${error.fieldPath}: ` : "";
            console.log(`    ${pathPrefix}${error.message}`);
            console.log(`    \u2192 ${error.suggestion}`);
          }
        }
      }
    }

    files.push(fileEntry);
  }

  if (jsonMode) {
    const exitCode = totalFailed > 0 ? 1 : 0;
    return {
      exitCode,
      data: { files, totalErrors, schemaOnly },
    };
  }

  // Summary
  console.log(
    `\n${totalFiles} file(s), ${totalResources} resource(s): ${totalPassed} passed, ${totalFailed} failed`
  );

  return totalFailed > 0 ? 1 : 0;
}
