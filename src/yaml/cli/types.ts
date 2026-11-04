/**
 * Structured result from a yaml subcommand when JSON output is requested.
 */
export interface CliResult {
  exitCode: number;
  data?: unknown; // command-specific structured payload
  errors?: string[]; // error messages if any
}

/**
 * Standard JSON envelope wrapping all yaml subcommand output.
 */
export interface YamlJsonOutput {
  success: boolean;
  exitCode: number;
  command: string; // e.g., 'validate', 'apply', 'init'
  data: unknown; // command-specific payload
  errors?: string[]; // error messages if any
}

export type FormatOption = "text" | "json";
