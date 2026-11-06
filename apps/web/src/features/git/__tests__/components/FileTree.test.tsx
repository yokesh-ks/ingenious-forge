import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FileTree from "../../components/FileTree";

const files = ["src/main.ts", "src/lib/util.ts", "README.md"];

describe("FileTree", () => {
  it("shows top-level entries with folders collapsed", () => {
    render(<FileTree files={files} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "src" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "main.ts" })).not.toBeInTheDocument();
  });

  it("expands and collapses folders", async () => {
    render(<FileTree files={files} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "src" }));
    expect(screen.getByRole("button", { name: "src" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "main.ts" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "lib" }));
    expect(screen.getByRole("button", { name: "util.ts" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "src" }));
    expect(screen.queryByRole("button", { name: "main.ts" })).not.toBeInTheDocument();
  });

  it("opens a file when it is clicked", async () => {
    const onOpen = vi.fn();
    render(<FileTree files={files} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(onOpen).toHaveBeenCalledWith("README.md");
  });

  it("marks the open file", () => {
    render(<FileTree files={files} onOpen={vi.fn()} selected="README.md" />);
    expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("filters files as the user types and opens a match", async () => {
    const onOpen = vi.fn();
    render(<FileTree files={files} onOpen={onOpen} />);
    await userEvent.type(screen.getByRole("searchbox", { name: /search files/i }), "util");
    const matches = screen.getAllByRole("button", { name: /util/ });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveTextContent("src/lib/util.ts");
    expect(screen.queryByRole("button", { name: "README.md" })).not.toBeInTheDocument();
    await userEvent.click(matches[0]);
    expect(onOpen).toHaveBeenCalledWith("src/lib/util.ts");
  });

  it("says when nothing matches", async () => {
    render(<FileTree files={files} onOpen={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: /search files/i }), "zzz");
    expect(screen.getByText(/no files match/i)).toBeInTheDocument();
  });

  it("says when the project has no files", () => {
    render(<FileTree files={[]} onOpen={vi.fn()} />);
    expect(screen.getByText(/no files/i)).toBeInTheDocument();
  });
});
