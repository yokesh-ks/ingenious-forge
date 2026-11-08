const isMac = () => navigator.userAgent.includes("Mac");

/** The system file manager's name, as the user knows it. */
export function fileManagerName(userAgent = navigator.userAgent) {
  if (userAgent.includes("Mac")) return "Finder";
  if (userAgent.includes("Windows")) return "Explorer";
  return "file manager";
}

/** A keyboard shortcut, written the way this platform writes it. */
export function shortcutLabel(modifier: "alt" | "shift", key: string) {
  if (isMac()) return `${modifier === "alt" ? "⌥" : "⇧"}⌘${key}`;
  return `Ctrl+${modifier === "alt" ? "Alt" : "Shift"}+${key}`;
}

/** A shortcut on the platform's main modifier alone. */
export function primaryShortcutLabel(key: string) {
  return isMac() ? `⌘${key}` : `Ctrl+${key}`;
}

/** A Control-key shortcut, written the way this platform writes it. */
export function ctrlShortcutLabel(key: string) {
  return isMac() ? `⌃${key}` : `Ctrl+${key}`;
}
