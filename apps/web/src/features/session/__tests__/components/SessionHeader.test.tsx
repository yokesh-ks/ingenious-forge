import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { catalog } from "@/test/catalog";
import SessionHeader from "../../components/SessionHeader";

describe("SessionHeader", () => {
  it("shows the session's model and reasoning effort", () => {
    render(
      <SessionHeader
        model={{ provider: "anthropic", model: "claude-sonnet-5-5", effort: "xhigh" }}
        catalog={catalog}
        approvalMode="ask"
        onApprovalModeChange={vi.fn()}
      />,
    );
    const header = screen.getByRole("group", { name: /session settings/i });
    expect(header).toHaveTextContent("Claude Sonnet 5.5");
    expect(header).toHaveTextContent("Extra high effort");
    expect(screen.getByTitle("Anthropic")).toBeInTheDocument();
  });

  it("shows only the approval mode for a session without a recorded model", () => {
    render(
      <SessionHeader
        model={null}
        catalog={catalog}
        approvalMode="full_auto"
        onApprovalModeChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/effort/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approval mode: full-auto/i })).toBeInTheDocument();
  });
});
