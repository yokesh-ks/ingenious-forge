import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GitBadge from "../../components/GitBadge";

describe("GitBadge", () => {
  it("shows the branch and the staged and changed counts", () => {
    render(<GitBadge status={{ branch: "feat/x", detached: false, staged: 2, changed: 3 }} />);
    const badge = screen.getByRole("group", { name: /git status/i });
    expect(badge).toHaveTextContent("feat/x");
    expect(badge).toHaveTextContent("2 staged");
    expect(badge).toHaveTextContent("3 changed");
  });

  it("says when there are no changes", () => {
    render(<GitBadge status={{ branch: "main", detached: false, staged: 0, changed: 0 }} />);
    expect(screen.getByRole("group", { name: /git status/i })).toHaveTextContent("No changes");
  });

  it("marks a detached head", () => {
    render(<GitBadge status={{ branch: "abc1234", detached: true, staged: 0, changed: 1 }} />);
    expect(screen.getByRole("group", { name: /git status/i })).toHaveTextContent(
      "detached at abc1234",
    );
  });

  it("shows nothing until the status is known", () => {
    const { container } = render(<GitBadge status={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
