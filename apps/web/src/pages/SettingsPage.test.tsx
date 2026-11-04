import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderKeyStatus } from "@/api/types";
import { catalog } from "@/test/catalog";
import { fakeFetch } from "@/test/fake-fetch";
import SettingsPage from "./SettingsPage";

afterEach(() => vi.unstubAllGlobals());

const none: ProviderKeyStatus = {
  provider: "anthropic",
  name: "Anthropic",
  hint: null,
  source: null,
};
const saved: ProviderKeyStatus = { ...none, hint: "…9876", source: "settings" };

describe("SettingsPage — model providers", () => {
  it("shows each provider and whether it has a key", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage />);
    const row = await screen.findByRole("group", { name: "Anthropic" });
    expect(row).toHaveTextContent(/no api key/i);
  });

  it("saves a key without ever showing it back", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [none],
      "PUT /api/settings/providers/anthropic/key": saved,
    });
    render(<SettingsPage />);
    const row = await screen.findByRole("group", { name: "Anthropic" });
    const input = within(row).getByLabelText(/anthropic api key/i);
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "sk-ant-secret-9876");
    await userEvent.click(within(row).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(row).toHaveTextContent("Key saved (…9876)"));
    expect(input).toHaveValue("");
    expect(row).not.toHaveTextContent("secret");
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ key: "sk-ant-secret-9876" });
  });

  it("says when the key comes from the environment", async () => {
    fakeFetch({
      "GET /api/settings/providers": [{ ...none, hint: "…0000", source: "environment" }],
    });
    render(<SettingsPage />);
    expect(await screen.findByRole("group", { name: "Anthropic" })).toHaveTextContent(
      /from the environment \(…0000\)/i,
    );
  });

  it("removes a saved key", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "DELETE /api/settings/providers/anthropic/key": none,
    });
    render(<SettingsPage />);
    const row = await screen.findByRole("group", { name: "Anthropic" });
    await userEvent.click(within(row).getByRole("button", { name: /remove key/i }));
    await waitFor(() => expect(row).toHaveTextContent(/no api key/i));
  });

  it("shows why a key could not be saved", async () => {
    fakeFetch({
      "GET /api/settings/providers": [none],
      "PUT /api/settings/providers/anthropic/key": () => ({
        status: 400,
        body: { error: "enter an API key" },
      }),
    });
    render(<SettingsPage />);
    const row = await screen.findByRole("group", { name: "Anthropic" });
    await userEvent.type(within(row).getByLabelText(/anthropic api key/i), "x");
    await userEvent.click(within(row).getByRole("button", { name: /save/i }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("enter an API key");
  });

  it("disables saving an empty key", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage />);
    const row = await screen.findByRole("group", { name: "Anthropic" });
    expect(within(row).getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("shows why the providers could not be loaded", async () => {
    fakeFetch({
      "GET /api/settings/providers": () => ({ status: 500, body: { error: "boom" } }),
    });
    render(<SettingsPage />);
    const providers = screen.getByRole("region", { name: /model providers/i });
    expect(await within(providers).findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("SettingsPage — new session defaults", () => {
  const routes = (defaults: unknown, extra: Record<string, unknown> = {}) => ({
    "GET /api/settings/providers": [none],
    "GET /api/models": catalog,
    "GET /api/settings/defaults": defaults,
    ...extra,
  });

  it("shows the saved defaults", async () => {
    fakeFetch(
      routes({
        model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low" },
        approval_mode: "full_auto",
      }),
    );
    render(<SettingsPage />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-sonnet-5-5"),
    );
    expect(within(form).getByLabelText(/reasoning effort/i)).toHaveValue("low");
    expect(within(form).getByLabelText(/approval mode/i)).toHaveValue("full_auto");
  });

  it("starts from the catalog default when no model is saved", async () => {
    fakeFetch(routes({ model: null, approval_mode: "ask" }));
    render(<SettingsPage />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-opus-5-5"),
    );
    expect(within(form).getByLabelText(/approval mode/i)).toHaveValue("ask");
  });

  it("saves the chosen defaults", async () => {
    const fetch = fakeFetch(
      routes(
        { model: null, approval_mode: "ask" },
        {
          "PUT /api/settings/defaults": (init: RequestInit | undefined) => ({
            body: JSON.parse(String(init?.body)),
          }),
        },
      ),
    );
    render(<SettingsPage />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-opus-5-5"),
    );
    await userEvent.selectOptions(within(form).getByLabelText(/^model$/i), "claude-sonnet-5-5");
    await userEvent.selectOptions(within(form).getByLabelText(/reasoning effort/i), "max");
    await userEvent.selectOptions(within(form).getByLabelText(/approval mode/i), "auto_edit");
    await userEvent.click(within(form).getByRole("button", { name: /save defaults/i }));

    expect(await within(form).findByText(/saved/i)).toBeInTheDocument();
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "max" },
      approval_mode: "auto_edit",
    });
  });

  it("shows why the defaults could not be saved", async () => {
    fakeFetch(
      routes(
        { model: null, approval_mode: "ask" },
        {
          "PUT /api/settings/defaults": () => ({
            status: 400,
            body: { error: "anthropic has no model x" },
          }),
        },
      ),
    );
    render(<SettingsPage />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-opus-5-5"),
    );
    await userEvent.click(within(form).getByRole("button", { name: /save defaults/i }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("no model x");
  });
});
