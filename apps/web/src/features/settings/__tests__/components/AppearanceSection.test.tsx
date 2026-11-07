import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/hooks/use-theme";
import AppearanceSection from "../../components/AppearanceSection";

beforeEach(() => localStorage.clear());
afterEach(() => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setPreference("system"));
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("AppearanceSection", () => {
  it("offers Light, Dark and System, with System selected at first", () => {
    render(<AppearanceSection />);
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual([
      "light",
      "dark",
      "system",
    ]);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
  });

  it("applies and saves the card that is clicked", async () => {
    render(<AppearanceSection />);
    await userEvent.click(screen.getByText("Dark"));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("forge-theme")).toBe("dark");

    await userEvent.click(screen.getByText("Light"));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("forge-theme")).toBe("light");
  });

  it("can be used with the keyboard", async () => {
    render(<AppearanceSection />);
    screen.getByRole("radio", { name: "System" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("stays in step with the top bar toggle", async () => {
    render(
      <>
        <ThemeToggle />
        <AppearanceSection />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    await userEvent.click(screen.getByText("Light"));
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });
});
