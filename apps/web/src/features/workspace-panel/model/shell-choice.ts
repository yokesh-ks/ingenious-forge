import type { TerminalShell } from "@/api/types";

const KEY = "forge.terminal.shell";

export function rememberedShell(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberShell(path: string) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // Without storage the choice lasts for this terminal only.
  }
}

/** The shell a new terminal opens: the remembered one while it is still
 * installed, otherwise the default. */
export function pickShell(shells: TerminalShell[]): TerminalShell | null {
  const remembered = rememberedShell();
  return shells.find((s) => s.path === remembered) ?? shells[0] ?? null;
}
