import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { catalog } from "@/test/catalog";
import SessionHeader from "./SessionHeader";

describe("SessionHeader", () => {
  it("shows the session's model and reasoning effort", () => {
    render(
      <SessionHeader
        model={{ provider: "anthropic", model: "claude-sonnet-5-5", effort: "xhigh" }}
        catalog={catalog}
      />,
    );
    const header = screen.getByRole("group", { name: /session settings/i });
    expect(header).toHaveTextContent("Claude Sonnet 5.5");
    expect(header).toHaveTextContent("Extra high effort");
    expect(screen.getByTitle("Anthropic")).toBeInTheDocument();
  });

  it("shows nothing for a session without a recorded model", () => {
    const { container } = render(<SessionHeader model={null} catalog={catalog} />);
    expect(container).toBeEmptyDOMElement();
  });
});
