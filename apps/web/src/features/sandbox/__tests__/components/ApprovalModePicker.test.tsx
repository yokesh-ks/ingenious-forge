import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ApprovalModePicker from "../../components/ApprovalModePicker";

describe("ApprovalModePicker", () => {
  it("shows the active mode", () => {
    render(<ApprovalModePicker mode="auto_edit" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /approval mode: auto-edit/i })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a picker with every mode, the active one checked", async () => {
    render(<ApprovalModePicker mode="ask" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /approval mode/i }));
    const options = screen.getAllByRole("menuitemradio");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringMatching(/^Ask/),
      expect.stringMatching(/^Auto-edit/),
      expect.stringMatching(/^Full-auto/),
    ]);
    expect(options[0]).toHaveAttribute("aria-checked", "true");
    expect(options[2]).toHaveTextContent(/without prompts/i);
  });

  it("selecting a mode reports it and closes the picker", async () => {
    const onChange = vi.fn();
    render(<ApprovalModePicker mode="ask" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /approval mode/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /full-auto/i }));
    expect(onChange).toHaveBeenCalledWith("full_auto");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("choosing the active mode again changes nothing", async () => {
    const onChange = vi.fn();
    render(<ApprovalModePicker mode="ask" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /approval mode/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /^ask/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    render(<ApprovalModePicker mode="ask" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /approval mode/i }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("is disabled while a change is being saved", () => {
    render(<ApprovalModePicker mode="ask" onChange={vi.fn()} saving />);
    expect(screen.getByRole("button", { name: /approval mode/i })).toBeDisabled();
  });
});
