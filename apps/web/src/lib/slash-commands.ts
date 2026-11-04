/** A command typed in the composer; the server expands it into a prompt. */
export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "init", description: "Generate an AGENTS.md for this project" },
];

/**
 * The commands `text` could be the start of: it must begin with `/` and
 * hold no arguments yet.
 */
export function matchSlashCommands(text: string): SlashCommand[] {
  const match = /^\/(\S*)$/.exec(text);
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(typed));
}
