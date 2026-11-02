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

  it("does not send while a turn is running", async () => {
    const { input, button, onSend } = setup({ busy: true });
    await userEvent.type(input, "wait{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(input).toHaveValue("wait");
  });
});
