import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Composer from "./Composer";

function setup(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn(() => true);
  render(<Composer onSend={onSend} {...props} />);
  return {
    onSend: (props.onSend as typeof onSend | undefined) ?? onSend,
    input: screen.getByPlaceholderText(/ask forge/i),
    button: screen.getByRole("button", { name: /send message/i }),
  };
}

describe("Composer", () => {
  it("disables the send button until there is text", async () => {
    const { input, button } = setup();
    expect(button).toBeDisabled();
    await userEvent.type(input, "   ");
    expect(button).toBeDisabled();
    await userEvent.type(input, "x");
    expect(button).toBeEnabled();
  });

  it("sends the trimmed text on Enter and clears the box", async () => {
    const { input, onSend } = setup();
    await userEvent.type(input, "  fix the bug  {Enter}");
    expect(onSend).toHaveBeenCalledWith("fix the bug");
    expect(input).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const { input, onSend } = setup();
    await userEvent.type(input, "a{Shift>}{Enter}{/Shift}b");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("a\nb");
  });

  it("sends when the button is clicked", async () => {
    const { input, button, onSend } = setup();
    await userEvent.type(input, "go");
    await userEvent.click(button);
    expect(onSend).toHaveBeenCalledWith("go");
  });

  it("keeps the text when sending fails", async () => {
    const onSend = vi.fn(() => false);
    const { input } = setup({ onSend });
    await userEvent.type(input, "keep me{Enter}");
    expect(input).toHaveValue("keep me");
  });

  it("sends a steering message while a turn is running", async () => {
    const { input, onSend } = setup({ busy: true, onStop: vi.fn() });
    await userEvent.type(input, "use tests instead{Enter}");
    expect(onSend).toHaveBeenCalledWith("use tests instead");
    expect(input).toHaveValue("");
  });

  it("shows a Stop button while a turn is running", async () => {
    const onStop = vi.fn();
    setup({ busy: true, onStop });
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("hides the Stop button when idle", () => {
    setup({ onStop: vi.fn() });
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
  });

  describe("slash commands", () => {
    it("lists /init when the text starts with a slash", async () => {
      const { input } = setup();
      await userEvent.type(input, "/");
      const menu = screen.getByRole("listbox", { name: /slash commands/i });
      expect(menu).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /\/init/i })).toHaveTextContent(/agents\.md/i);
    });

    it("shows no menu for ordinary text or an unknown command", async () => {
      const { input } = setup();
      await userEvent.type(input, "hello /");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await userEvent.clear(input);
      await userEvent.type(input, "/xyz");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("completes a partial command on Tab", async () => {
      const { input, onSend } = setup();
      await userEvent.type(input, "/in{Tab}");
      expect(input).toHaveValue("/init");
      expect(onSend).not.toHaveBeenCalled();
    });

    it("completes a partial command on Enter instead of sending it", async () => {
      const { input, onSend } = setup();
      await userEvent.type(input, "/i{Enter}");
      expect(input).toHaveValue("/init");
      expect(onSend).not.toHaveBeenCalled();
    });

    it("sends a complete command on Enter", async () => {
      const { input, onSend } = setup();
      await userEvent.type(input, "/init{Enter}");
      expect(onSend).toHaveBeenCalledWith("/init");
      expect(input).toHaveValue("");
    });

    it("fills the command when its option is clicked", async () => {
      const { input } = setup();
      await userEvent.type(input, "/");
      await userEvent.click(screen.getByRole("option", { name: /\/init/i }));
      expect(input).toHaveValue("/init");
      expect(input).toHaveFocus();
    });

    it("hides the menu on Escape and keeps the text", async () => {
      const { input, onSend } = setup();
      await userEvent.type(input, "/in{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(input).toHaveValue("/in");
      await userEvent.type(input, "{Enter}");
      expect(onSend).toHaveBeenCalledWith("/in");
    });

    it("hides the menu once the command has arguments", async () => {
      const { input } = setup();
      await userEvent.type(input, "/init focus");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });
});
