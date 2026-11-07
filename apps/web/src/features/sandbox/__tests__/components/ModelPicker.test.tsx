import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionModel } from "@/api/types";
import { catalog } from "@/test/catalog";
import ModelPicker from "../../components/ModelPicker";

const opus: SessionModel = { provider: "anthropic", model: "claude-opus-5-5", effort: "max" };

describe("ModelPicker", () => {
  it("shows the model and its effort", () => {
    render(<ModelPicker model={opus} catalog={catalog} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Model: Claude Opus 5.5" });
    expect(button).toHaveTextContent("Max");
    expect(button).toHaveAttribute("title", "Anthropic");
  });

  it("shows the default for a session without a recorded model", () => {
    render(<ModelPicker model={null} catalog={catalog} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Model: Claude Opus 5.5" })).toHaveTextContent(
      "High",
    );
  });

  it("shows nothing when no model is known", () => {
    const { container } = render(<ModelPicker model={null} catalog={null} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("choosing a model reports it with an effort that model offers", async () => {
    const onChange = vi.fn();
    render(<ModelPicker model={opus} catalog={catalog} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /model:/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Echo" }));
    expect(onChange).toHaveBeenCalledWith({ provider: "stub", model: "echo", effort: "high" });
  });

  it("choosing an effort keeps the model", async () => {
    const onChange = vi.fn();
    render(<ModelPicker model={opus} catalog={catalog} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /model:/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Low" }));
    expect(onChange).toHaveBeenCalledWith({ ...opus, effort: "low" });
  });

  it("choosing the current model reports nothing", async () => {
    const onChange = vi.fn();
    render(<ModelPicker model={opus} catalog={catalog} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /model:/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Claude Opus 5.5" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cannot be opened while disabled", () => {
    render(<ModelPicker model={opus} catalog={catalog} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /model:/i })).toBeDisabled();
  });
});
