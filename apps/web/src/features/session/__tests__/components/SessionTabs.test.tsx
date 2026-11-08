import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import SessionTabs from "../../components/SessionTabs";

function views() {
  return {
    chat: <p>chat view</p>,
    trajectory: <p>trajectory view</p>,
    statistics: <p>statistics view</p>,
  };
}

describe("SessionTabs", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("shows Chat by default", () => {
    render(<SessionTabs {...views()} />);
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("chat view")).toBeInTheDocument();
    expect(screen.queryByText("statistics view")).not.toBeInTheDocument();
  });

  it("switches views and keeps the choice in the URL", async () => {
    window.history.replaceState(null, "", "/projects/p/sessions/s");
    render(<SessionTabs {...views()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Statistics" }));
    expect(screen.getByText("statistics view")).toBeInTheDocument();
    expect(window.location.search).toBe("?view=statistics");
    await userEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(window.location.search).toBe("");
  });

  it("opens the view the URL names", () => {
    window.history.replaceState(null, "", "/x?view=trajectory");
    render(<SessionTabs {...views()} />);
    expect(screen.getByText("trajectory view")).toBeInTheDocument();
  });
});
