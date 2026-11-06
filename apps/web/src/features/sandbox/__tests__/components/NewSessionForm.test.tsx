import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelCatalog } from "@/api/types";
import { catalog } from "@/test/catalog";
import NewSessionForm from "../../components/NewSessionForm";

function setup(props: Partial<Parameters<typeof NewSessionForm>[0]> = {}) {
  const onStart = vi.fn();
  const onCancel = vi.fn();
  render(
    <NewSessionForm
      catalog={catalog}
      error={null}
      onStart={onStart}
      onCancel={onCancel}
      {...props}
    />,
  );
  return {
    onStart,
    onCancel,
    provider: () => screen.getByLabelText(/provider/i),
    model: () => screen.getByLabelText(/^model$/i),
    effort: () => screen.getByLabelText(/reasoning effort/i),
    start: () => screen.getByRole("button", { name: /start session/i }),
  };
}

describe("NewSessionForm", () => {
  it("starts with the catalog default selected", () => {
    const { provider, model, effort } = setup();
    expect(provider()).toHaveValue("anthropic");
    expect(model()).toHaveValue("claude-opus-5-5");
    expect(effort()).toHaveValue("high");
    expect(screen.getByRole("option", { name: "Extra high" })).toBeInTheDocument();
  });

  it("starts the session with the chosen provider, model and effort", async () => {
    const { model, effort, start, onStart } = setup();
    await userEvent.selectOptions(model(), "claude-sonnet-5-5");
    await userEvent.selectOptions(effort(), "max");
    await userEvent.click(start());
    expect(onStart).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      effort: "max",
    });
  });

  it("picks the new provider's first model when the provider changes", async () => {
    const { provider, model, start, onStart } = setup();
    await userEvent.selectOptions(provider(), "stub");
    expect(model()).toHaveValue("echo");
    expect(screen.queryByRole("option", { name: "Claude Opus 5.5" })).not.toBeInTheDocument();
    await userEvent.click(start());
    expect(onStart).toHaveBeenCalledWith({ provider: "stub", model: "echo", effort: "high" });
  });

  it("can be cancelled", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables starting while a session is being created", () => {
    const { start } = setup({ starting: true });
    expect(start()).toBeDisabled();
  });

  it("shows a loading state until the catalog arrives", () => {
    setup({ catalog: null });
    expect(screen.getByText(/loading models/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start session/i })).not.toBeInTheDocument();
  });

  it("shows why the catalog could not be loaded", () => {
    setup({ catalog: null, error: "Cannot reach the Forge server." });
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the Forge server.");
  });

  it("says so when no provider is configured", () => {
    const empty: ModelCatalog = { providers: [], efforts: catalog.efforts, default: null };
    setup({ catalog: empty });
    expect(screen.getByText(/no model provider/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start session/i })).not.toBeInTheDocument();
  });
});
