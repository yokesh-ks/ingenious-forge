import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DiffView from "../../components/DiffView";

const diff = [
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,3 +1,3 @@",
  " one",
  "-two",
  "+2",
  " three",
  "\\ No newline at end of file",
  "",
].join("\n");

function rows() {
  return screen.getAllByTestId("diff-line").map((el) => [el.dataset.kind, el.textContent]);
}

describe("DiffView", () => {
  it("classifies every line of a unified diff", () => {
    render(<DiffView diff={diff} />);
    expect(rows()).toEqual([
      ["header", "--- a/a.txt"],
      ["header", "+++ b/a.txt"],
      ["hunk", "@@ -1,3 +1,3 @@"],
      ["context", " one"],
      ["removed", "-two"],
      ["added", "+2"],
      ["context", " three"],
      ["meta", "\\ No newline at end of file"],
    ]);
  });

  it("colours added lines green and removed lines red", () => {
    render(<DiffView diff={diff} />);
    const [added] = screen.getAllByTestId("diff-line").filter((el) => el.dataset.kind === "added");
    const [removed] = screen
      .getAllByTestId("diff-line")
      .filter((el) => el.dataset.kind === "removed");
    expect(added.className).toMatch(/green/);
    expect(removed.className).toMatch(/red/);
  });

  it("says so when there is no difference", () => {
    render(<DiffView diff="" />);
    expect(screen.getByText(/no changes/i)).toBeInTheDocument();
  });
});
