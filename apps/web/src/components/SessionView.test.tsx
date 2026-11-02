import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionMessage } from "@/session/session-reducer";
import SessionView from "./SessionView";

const conversation: SessionMessage[] = [
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

  it("shows an error alert", () => {
    render(<SessionView messages={conversation} running={false} error="no key" />);
    expect(screen.getByRole("alert")).toHaveTextContent("no key");
  });

  it("shows an error even before any message exists", () => {
    render(<SessionView messages={[]} running={false} error="offline" />);
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});
