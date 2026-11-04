import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionItem } from "@/session/session-reducer";
import SessionView from "./SessionView";

const conversation: SessionItem[] = [
  { id: "m0", role: "user", text: "hi" },
  { id: "m1", role: "assistant", text: "Hello there" },
];

describe("SessionView", () => {
  it("shows the empty state when there are no messages", () => {
    render(<SessionView messages={[]} running={false} error={null} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders user and assistant messages in order", () => {
    render(<SessionView messages={conversation} running={false} error={null} />);
    const texts = screen.getAllByTestId("message-text").map((el) => el.textContent);
    expect(texts).toEqual(["hi", "Hello there"]);
  });

  it("shows a thinking indicator while waiting for the first token", () => {
    render(<SessionView messages={conversation.slice(0, 1)} running error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("hides the thinking indicator once the reply is streaming", () => {
    render(<SessionView messages={conversation} running error={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders tool calls inline between messages", () => {
    render(
      <SessionView
        messages={[
          ...conversation,
          {
            id: "m2",
            role: "tool",
            callId: "t1",
            name: "read_file",
            args: { path: "README.md" },
            status: "done",
            output: "# Forge",
            lines: [],
            exitCode: null,
          },
        ]}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByTestId("tool-output")).toHaveTextContent("# Forge");
  });

  it("shows the thinking indicator after a tool finishes mid-turn", () => {
    render(
      <SessionView
        messages={[
          conversation[0],
          {
            id: "m1",
            role: "tool",
            callId: "t1",
            name: "list_directory",
            args: {},
            status: "done",
            output: "a",
            lines: [],
            exitCode: null,
          },
        ]}
        running
        error={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("shows notices such as an interrupted turn", () => {
    render(
      <SessionView
        messages={[...conversation, { id: "m2", role: "notice", text: "Turn interrupted" }]}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText("Turn interrupted")).toBeInTheDocument();
  });

  it("shows an error alert", () => {
    render(<SessionView messages={conversation} running={false} error="no key" />);
    expect(screen.getByRole("alert")).toHaveTextContent("no key");
  });

  it("shows an error even before any message exists", () => {
    render(<SessionView messages={[]} running={false} error="offline" />);
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});
