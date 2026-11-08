import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionStats } from "@/api/types";
import { fakeFetch } from "@/test/fake-fetch";
import ReplyFooter from "../../components/ReplyFooter";
import SessionMetrics from "../../components/SessionMetrics";

const stats: SessionStats = {
  turns: 1,
  steps: 6,
  usage: { input: 80_000, output: 3_400, cache_read: 160_000, cache_write: 10_000 },
  model_ms: 40_000,
  tool_ms: 2_000,
  ttft_ms: 3_000,
  ttft_steps: 6,
  decode_ms: 20_000,
  decode_tokens: 3_220,
  last_context_tokens: 10_240,
  context_window: 128_000,
};

describe("SessionMetrics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads turns, steps, speed, tokens, cache hit and context use", async () => {
    fakeFetch({ "GET /api/sessions/s1/stats": stats });
    render(<SessionMetrics sessionId="s1" refreshKey="a" />);
    const bar = await screen.findByRole("group", { name: "Session metrics" });
    expect(bar).toHaveTextContent("1 turns 6 steps · 161 tok/s");
    expect(bar).toHaveTextContent("253K tok · Cache hit 64%");
    expect(screen.getByLabelText("8% of context used")).toBeInTheDocument();
  });

  it("leaves out what it cannot know", async () => {
    fakeFetch({
      "GET /api/sessions/s1/stats": {
        ...stats,
        decode_ms: 0,
        decode_tokens: 0,
        context_window: null,
      },
    });
    render(<SessionMetrics sessionId="s1" refreshKey="a" />);
    const bar = await screen.findByRole("group", { name: "Session metrics" });
    expect(bar).not.toHaveTextContent("tok/s");
    expect(screen.queryByLabelText(/of context used/)).not.toBeInTheDocument();
  });

  it("shows nothing before the first step", async () => {
    const fetch = fakeFetch({ "GET /api/sessions/s1/stats": { ...stats, steps: 0 } });
    render(<SessionMetrics sessionId="s1" refreshKey="a" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Session metrics" })).not.toBeInTheDocument();
  });

  it("reloads when the session moves on", async () => {
    const fetch = fakeFetch({ "GET /api/sessions/s1/stats": stats });
    const { rerender } = render(<SessionMetrics sessionId="s1" refreshKey="a" />);
    await screen.findByRole("group", { name: "Session metrics" });
    rerender(<SessionMetrics sessionId="s1" refreshKey="b" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});

describe("ReplyFooter", () => {
  it("copies the reply and shows the turn's tokens and time", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ReplyFooter
        text="All done."
        usage={{ input: 50_000, output: 900, cache_read: 9_000, cache_write: 0 }}
        at={new Date().setHours(14, 34)}
      />,
    );
    expect(screen.getByText("Usage 59.9K tok")).toBeInTheDocument();
    expect(screen.getByText("14:34")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy reply" }));
    expect(writeText).toHaveBeenCalledWith("All done.");
  });

  it("explains the usage on hover", async () => {
    render(
      <ReplyFooter
        text="x"
        usage={{ input: 1_000, output: 200, cache_read: 3_000, cache_write: 40 }}
        at={null}
      />,
    );
    await userEvent.hover(screen.getByText("Usage 4.2K tok"));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/Input\s*1K/);
    expect(tip).toHaveTextContent(/Output\s*200/);
    expect(tip).toHaveTextContent(/Cache read\s*3K/);
    expect(tip).toHaveTextContent(/Cache write\s*40/);
  });

  it("shows only Copy without usage or time", () => {
    render(<ReplyFooter text="x" usage={null} at={null} />);
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeInTheDocument();
    expect(screen.queryByText(/Usage/)).not.toBeInTheDocument();
  });
});
