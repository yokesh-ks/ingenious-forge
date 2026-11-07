import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../use-theme";

/** A controllable system setting. */
function fakeSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList);
  return {
    set(next: boolean) {
      dark = next;
      for (const listener of listeners) listener();
    },
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setPreference("system"));
  localStorage.clear();
});

describe("useTheme", () => {
  it("follows the system until the user chooses", () => {
    fakeSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("does not save a choice the user never made", () => {
    fakeSystem(true);
    renderHook(() => useTheme());
    expect(localStorage.getItem("forge-theme")).toBeNull();
  });

  it("follows a system change while on System", () => {
    const system = fakeSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(isDark()).toBe(false);
    act(() => system.set(true));
    expect(result.current.theme).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("ignores a system change once a theme is chosen", () => {
    const system = fakeSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("light"));
    act(() => system.set(true));
    expect(result.current.theme).toBe("light");
    expect(isDark()).toBe(false);
  });

  it("saves the choice for the next load", () => {
    fakeSystem(false);
    const { result, unmount } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(localStorage.getItem("forge-theme")).toBe("dark");
    unmount();
    expect(renderHook(() => useTheme()).result.current.preference).toBe("dark");
  });

  it("keeps every caller in step", () => {
    fakeSystem(false);
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());
    act(() => first.result.current.toggleTheme());
    expect(second.result.current.preference).toBe("dark");
    act(() => second.result.current.setPreference("system"));
    expect(first.result.current.theme).toBe("light");
  });

  it("flips from what is showing when toggled on System", () => {
    fakeSystem(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.preference).toBe("light");
  });

  it("still works when storage is disabled", () => {
    fakeSystem(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(result.current.theme).toBe("dark");
    vi.restoreAllMocks();
  });
});
