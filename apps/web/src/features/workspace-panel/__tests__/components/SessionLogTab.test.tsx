import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionEnvelope } from "@/api/types";
import SessionLogTab from "../../components/SessionLogTab";

const event = (seq: number, type: string, data: object = {}) =>
  ({ seq, ts: 1000, type, session_id: "s", ...data }) as unknown as SessionEnvelope;

const events = [
  event(1, "user_message", { text: "hi", source: "human" }),
  event(2, "turn_started", { turn: 1 }),
  event(3, "step_started", { turn: 1, step: 1 }),
  event(4, "assistant_message", { turn: 1, step: 1, content: [{ type: "text", text: "ok" }] }),
  event(5, "tool_call", { turn: 1, step: 1, call_id: "c1", name: "bash" }),
];

const setup = (props: Partial<Parameters<typeof SessionLogTab>[0]> = {}) =>
  render(
    <SessionLogTab
      events={events}
      hasOlder={false}
      loadingOlder={false}
      onLoadOlder={() => {}}
      {...props}
    />,
  );

const types = () =>
  [...document.querySelectorAll("tbody tr[data-log-row] td:nth-child(2)")].map(
    (cell) => cell.textContent,
  );

describe("the Session log", () => {
  it("starts on the raw log with its count and columns", () => {
    setup();
    expect(screen.getByLabelText("Presentation")).toHaveValue("raw");
    expect(screen.getByText("· 5")).toBeInTheDocument();
    for (const name of ["Index", "T/S", "Time (UTC)", "Data"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(types()).toContain("tool_call");
  });

  it("switches to the chat's parts, which have no time column", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("Presentation"), "chat");
    expect(types()).toEqual(["user", "turn-process", "assistant-step", "group", "tool-call"]);
    expect(screen.queryByRole("columnheader", { name: "Time (UTC)" })).toBeNull();
  });

  it("folds a group", async () => {
    setup();
    const collapse = screen.getAllByRole("button", { name: "Collapse children" });
    await userEvent.click(collapse[0]);
    expect(types()).toEqual(["user_message", "turn_started"]);
  });

  it("shows a selected record's raw data, and marks it in the chat", async () => {
    const chat = document.createElement("div");
    chat.setAttribute("aria-label", "Session");
    chat.innerHTML = '<div data-chat-call="c1"></div>';
    const target = chat.firstElementChild as HTMLElement;
    target.scrollIntoView = vi.fn();
    document.body.append(chat);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "tool_call" }));
    expect(
      within(screen.getByRole("list", { name: "Raw data" })).getByText(/"bash"/),
    ).toBeVisible();
    expect(target.scrollIntoView).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("list", { name: "Raw data" })).toBeNull();
    chat.remove();
  });

  it("filters by type, keeping parents, and shows both counts", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter types" }));
    await userEvent.type(await screen.findByLabelText("Type keyword"), "tool{Enter}");
    expect(screen.getByText("· 1 / 5")).toBeInTheDocument();
    expect(types()).toEqual(["turn_started", "step_started", "tool_call"]);
  });

  it("loads earlier records on request", async () => {
    const onLoadOlder = vi.fn();
    setup({ hasOlder: true, onLoadOlder });
    await userEvent.click(screen.getByRole("button", { name: "Load earlier" }));
    expect(onLoadOlder).toHaveBeenCalled();
  });

  it("says when there is nothing to show", () => {
    setup({ events: [] });
    expect(screen.getByText("No records")).toBeInTheDocument();
  });

  it("explains when no chat is on screen to pick from", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Pick an element in the chat view" }));
    expect(screen.getByRole("status")).toHaveTextContent("Open this session in the main chat");
  });

  it("selects the record of a clicked chat element", async () => {
    const chat = document.createElement("div");
    chat.setAttribute("aria-label", "Session");
    chat.innerHTML = '<div data-chat-turn="1"><div data-chat-call="c1"></div></div>';
    document.body.append(chat);
    const hit = chat.querySelector("[data-chat-call]") as HTMLElement;
    const original = document.elementsFromPoint;
    document.elementsFromPoint = () => [hit];
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Pick an element in the chat view" }));
    const mask = document.querySelector(".cursor-crosshair") as HTMLElement;
    await userEvent.click(mask);
    expect(document.querySelector("tr[aria-selected=true]")).toHaveTextContent("tool_call");
    expect(document.querySelector(".cursor-crosshair")).toBeNull();
    document.elementsFromPoint = original;
    chat.remove();
  });
});
