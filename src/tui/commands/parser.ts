/**
 * Re-export command parser from canonical location.
 * Both the TUI overlay and CLI subcommand share the same implementation.
 */
export {
  parseCommand,
  normaliseVerb,
  normaliseResource,
  type ParsedCommand,
} from "@/cmd/parser";
