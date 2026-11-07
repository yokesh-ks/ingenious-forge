import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
/** What the user chose: a fixed theme, or whatever the system uses. */
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "forge-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Keeps the choice for this page load when storage is disabled.
let unsaved: ThemePreference = "system";
const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : unsaved;
  } catch {
    return unsaved;
  }
}

function setStoredPreference(preference: ThemePreference) {
  unsaved = preference;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore - e.g. storage disabled
  }
  for (const listener of listeners) listener();
}

function subscribePreference(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function systemIsDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

function subscribeSystem(listener: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** The theme in use, shared by every caller, so the top bar toggle and the
 * Appearance page cannot disagree. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribePreference, getPreference);
  const dark = useSyncExternalStore(subscribeSystem, systemIsDark);
  const theme: Theme = preference === "system" ? (dark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setStoredPreference(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return { theme, preference, setPreference: setStoredPreference, toggleTheme };
}
