import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderKeyStatus } from "@/api/types";
import { PROVIDER_LOGOS } from "@/features/settings/logos/provider-logos";
import { catalog } from "@/test/catalog";
import { fakeFetch } from "@/test/fake-fetch";
import SettingsPage from "../SettingsPage";

afterEach(() => vi.unstubAllGlobals());

const none: ProviderKeyStatus = {
  provider: "anthropic",
  name: "Anthropic",
  description: "Direct access to Claude models",
  hint: null,
  source: null,
  env_var: "ANTHROPIC_API_KEY",
  custom: false,
  base_url: null,
  default_base_url: "https://api.example.com",
  models: null,
  default_models: [{ id: "m1", name: "Model 1" }],
  key_valid: null,
};
const saved: ProviderKeyStatus = {
  ...none,
  hint: "…9876",
  source: "settings",
  key_valid: true,
};
const nvidia: ProviderKeyStatus = {
  provider: "nvidia",
  name: "NVIDIA",
  description: "Models hosted by NVIDIA",
  hint: null,
  source: null,
  env_var: "NVIDIA_API_KEY",
  custom: false,
  base_url: null,
  default_base_url: "https://api.example.com",
  models: null,
  default_models: [{ id: "m1", name: "Model 1" }],
  key_valid: null,
};

/** Opens the Add model sheet on its manual tab. */
async function openManual(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
  const sheet = screen.getByRole("dialog", { name: "Add model" });
  await userEvent.click(within(sheet).getByRole("tab", { name: "Enter manually" }));
  return sheet;
}

/** Opens the Add model sheet and waits for the provider's list. */
async function openPicker(panel: HTMLElement) {
  await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
  const sheet = screen.getByRole("dialog", { name: "Add model" });
  await within(sheet).findAllByRole("checkbox");
  return sheet;
}

/** Ticks the base URL checkbox and types into the field it shows. */
async function typeBaseUrl(panel: HTMLElement, url: string) {
  await userEvent.click(within(panel).getByRole("checkbox", { name: "Use custom base URL" }));
  await userEvent.type(within(panel).getByLabelText("Base URL"), url);
}

/** Adds a model through the sheet that Add model opens. */
async function addModel(panel: HTMLElement, id: string, name?: string) {
  const sheet = await openManual(panel);
  await userEvent.type(within(sheet).getByLabelText("Model ID"), id);
  if (name) await userEvent.type(within(sheet).getByLabelText("Display name"), name);
  await userEvent.click(within(sheet).getByRole("button", { name: "Add model" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

/** The rows of a provider list, by name. */
async function rowsOf(list: string) {
  const items = within(await screen.findByRole("list", { name: list })).getAllByRole("listitem");
  return items.map((item) => item.getAttribute("aria-label"));
}

describe("SettingsPage — model providers", () => {
  it("starts with nothing connected and every provider ready to connect", async () => {
    fakeFetch({ "GET /api/settings/providers": [none, nvidia] });
    render(<SettingsPage section="providers" />);
    expect(await screen.findByText("No connected providers")).toBeInTheDocument();
    expect(await rowsOf("Popular providers")).toEqual(["Anthropic", "NVIDIA", "Custom provider"]);
    const row = screen.getByRole("listitem", { name: "NVIDIA" });
    expect(row).toHaveTextContent("Models hosted by NVIDIA");
    expect(within(row).getByRole("button", { name: "Connect NVIDIA" })).toBeInTheDocument();
    expect(row.querySelector("input")).toBeNull();
  });

  it("connects a provider through the panel, without ever showing the key back", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [none, nvidia],
      "PUT /api/settings/providers/anthropic/key": saved,
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));

    const panel = screen.getByRole("form", { name: "Connect Anthropic" });
    expect(panel).toHaveTextContent("ANTHROPIC_API_KEY");
    const input = within(panel).getByLabelText(/anthropic api key/i);
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "sk-ant-secret-9876");
    await userEvent.click(within(panel).getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(await rowsOf("Connected providers")).toEqual(["Anthropic"]);
    expect(await rowsOf("Popular providers")).toEqual(["NVIDIA", "Custom provider"]);
    const row = screen.getByRole("listitem", { name: "Anthropic" });
    expect(row).not.toHaveTextContent("API key");
    expect(document.body).not.toHaveTextContent("secret");
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ key: "sk-ant-secret-9876" });
  });

  it("changes a connected provider's key", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [saved],
      "PUT /api/settings/providers/anthropic/key": { ...saved, hint: "…1234" },
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const panel = screen.getByRole("form", { name: "Edit Anthropic" });
    await userEvent.type(within(panel).getByLabelText(/api key/i), "sk-new-1234");
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ key: "sk-new-1234" });
  });

  it("can be cancelled without saving", async () => {
    const fetch = fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("names the variable when the key comes from the environment, and offers no disconnect", async () => {
    fakeFetch({
      "GET /api/settings/providers": [{ ...none, hint: "…0000", source: "environment" }],
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(row).toHaveTextContent("Environment");
    expect(row).toHaveTextContent("Using ANTHROPIC_API_KEY (…0000)");
    expect(within(row).queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit" })).toBeEnabled();
  });

  it("leaves other providers alone when one changes", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [saved, nvidia],
      "PUT /api/settings/providers/nvidia/key": { ...nvidia, hint: "…1111", source: "settings" },
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect NVIDIA" }));
    const panel = screen.getByRole("form");
    // Only a key is needed; the base URL stays hidden until asked for.
    expect(within(panel).getByRole("checkbox", { name: "Use custom base URL" })).not.toBeChecked();
    expect(within(panel).queryByLabelText("Base URL")).toBeNull();
    await userEvent.type(within(panel).getByLabelText(/nvidia api key/i), "nv-1111");
    await userEvent.click(within(panel).getByRole("button", { name: "Connect" }));

    await waitFor(async () =>
      expect(await rowsOf("Connected providers")).toEqual(["Anthropic", "NVIDIA"]),
    );
    const writes = fetch.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(writes.map(([url]) => String(url))).toEqual(["/api/settings/providers/nvidia/key"]);
  });

  it("moves a disconnected provider back to the list", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "DELETE /api/settings/providers/anthropic/key": none,
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("No connected providers")).toBeInTheDocument();
    expect(await rowsOf("Popular providers")).toEqual(["Anthropic", "Custom provider"]);
  });

  it("stays connected on the environment key after a saved key is removed", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "DELETE /api/settings/providers/anthropic/key": {
        ...none,
        hint: "…0000",
        source: "environment",
      },
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(screen.getByRole("listitem", { name: "Anthropic" })).toHaveTextContent(
        "Using ANTHROPIC_API_KEY",
      ),
    );
  });

  it("keeps the panel open and says why a key could not be saved", async () => {
    fakeFetch({
      "GET /api/settings/providers": [none],
      "PUT /api/settings/providers/anthropic/key": () => ({
        status: 400,
        body: { error: "enter an API key" },
      }),
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    const panel = screen.getByRole("form");
    await userEvent.type(within(panel).getByLabelText(/api key/i), "x");
    await userEvent.click(within(panel).getByRole("button", { name: "Connect" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("enter an API key");
  });

  it("disables saving an empty key", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    const panel = screen.getByRole("form");
    expect(within(panel).getByRole("button", { name: "Connect" })).toBeDisabled();
    await userEvent.type(within(panel).getByLabelText(/api key/i), "   ");
    expect(within(panel).getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("shows why a disconnect failed", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "DELETE /api/settings/providers/anthropic/key": () => ({
        status: 500,
        body: { error: "boom" },
      }),
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    const row = screen.getByRole("listitem", { name: "Anthropic" });
    expect(await within(row).findByRole("alert")).toHaveTextContent("boom");
    expect(within(row).getByRole("button", { name: "Disconnect" })).toBeEnabled();
  });

  it("shows why the providers could not be loaded", async () => {
    fakeFetch({
      "GET /api/settings/providers": () => ({ status: 500, body: { error: "boom" } }),
    });
    render(<SettingsPage section="providers" />);
    const providers = screen.getByRole("region", { name: /model providers/i });
    expect(await within(providers).findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("SettingsPage — how providers appear", () => {
  it("shows each shipped provider's logo, and a generic mark for its own", async () => {
    const custom: ProviderKeyStatus = {
      ...saved,
      provider: "custom-gw",
      name: "My Gateway",
      custom: true,
    };
    fakeFetch({ "GET /api/settings/providers": [none, nvidia, custom] });
    render(<SettingsPage section="providers" />);
    const logo = (name: string) =>
      screen.getByRole("listitem", { name }).querySelector("[data-provider-logo]");
    await screen.findByRole("listitem", { name: "NVIDIA" });
    expect(logo("Anthropic")).toHaveAttribute("data-provider-logo", "anthropic");
    expect(logo("NVIDIA")).toHaveAttribute("data-provider-logo", "nvidia");
    expect(logo("NVIDIA")?.querySelector("path")).toHaveAttribute("d");
    expect(logo("My Gateway")).toBeNull();
    expect(
      screen.getByRole("listitem", { name: "My Gateway" }).querySelector("svg"),
    ).not.toBeNull();
    expect(logo("Custom provider")).toBeNull();
  });

  it("has a logo for every provider Forge ships", () => {
    expect(Object.keys(PROVIDER_LOGOS).sort()).toEqual([
      "anthropic",
      "deepseek",
      "google",
      "nvidia",
      "openai",
      "openrouter",
      "vercel",
    ]);
  });

  it("opens Connect in the page with no overlay, and marks the row", async () => {
    fakeFetch({ "GET /api/settings/providers": [none, nvidia] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));

    const form = screen.getByRole("form", { name: "Connect Anthropic" });
    expect(form).toHaveAttribute("data-provider-config");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(form).getByLabelText(/api key/i)).toHaveFocus();
    expect(screen.getByRole("listitem", { name: "Anthropic" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("can be left by Back on a narrow screen or Close on a wide one", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    for (const name of ["Back to providers", "Close"]) {
      await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
      await userEvent.click(screen.getByRole("button", { name }));
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("listitem", { name: "Anthropic" })).not.toHaveAttribute("aria-current");
  });

  it("swaps the list for the page only on a narrow screen", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    const list = await screen.findByRole("list", { name: "Popular providers" });
    const column = list.parentElement?.parentElement as HTMLElement;
    expect(column).toHaveClass("flex");
    await userEvent.click(screen.getByRole("button", { name: "Connect Anthropic" }));
    expect(column).toHaveClass("hidden", "@2xl/providers:flex");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "hidden",
      "@2xl/providers:inline-flex",
    );
    expect(screen.getByRole("button", { name: "Back to providers" })).toHaveClass(
      "@2xl/providers:hidden",
    );
  });

  it("switches to the provider clicked next, starting it afresh", async () => {
    fakeFetch({ "GET /api/settings/providers": [none, nvidia] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    await userEvent.type(screen.getByLabelText(/anthropic api key/i), "half-typed");

    await userEvent.click(screen.getByRole("button", { name: "Connect NVIDIA" }));

    expect(screen.getByRole("form", { name: "Connect NVIDIA" })).toBeInTheDocument();
    expect(screen.getByLabelText(/nvidia api key/i)).toHaveValue("");
    expect(screen.getAllByRole("form")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /custom provider/i }));
    expect(screen.getByRole("form", { name: "Custom provider" })).toBeInTheDocument();
    expect(screen.getAllByRole("form")).toHaveLength(1);
  });

  it("closes the configuration when its provider is disconnected", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "DELETE /api/settings/providers/anthropic/key": none,
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("form", { name: "Edit Anthropic" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  });

  it("puts the actions at the very end of the page", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    const form = screen.getByRole("form", { name: "Connect Anthropic" });
    expect(form.lastElementChild?.tagName).toBe("FOOTER");
    expect(
      within(form.lastElementChild as HTMLElement).getByRole("button", { name: "Connect" }),
    ).toBeInTheDocument();
  });
});

describe("SettingsPage — customized settings", () => {
  async function openPanel(routes: Record<string, unknown>, provider = none) {
    const fetch = fakeFetch({ "GET /api/settings/providers": [provider], ...routes });
    render(<SettingsPage section="providers" />);
    const name = provider.source ? "Edit" : "Connect Anthropic";
    await userEvent.click(await screen.findByRole("button", { name }));
    return { fetch, panel: screen.getByRole("form") };
  }
  const calls = (fetch: ReturnType<typeof fakeFetch>, method: string) =>
    fetch.mock.calls.filter(([, init]) => init?.method === method);
  const listing = [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
    { id: "gamma", name: "Gamma" },
  ];

  it("says the environment variable was not found", async () => {
    const { panel } = await openPanel({});
    expect(panel).toHaveTextContent(/env var not detected.*ANTHROPIC_API_KEY/i);
  });

  it("says the environment variable was found, and needs no key", async () => {
    const { panel } = await openPanel({}, { ...none, hint: "…0000", source: "environment" });
    expect(panel).toHaveTextContent("Detected ANTHROPIC_API_KEY");
    expect(within(panel).getByLabelText(/api key/i)).toHaveAttribute(
      "placeholder",
      "Leave blank to use ANTHROPIC_API_KEY",
    );
  });

  it("says how the key is kept and where to get one", async () => {
    const { panel } = await openPanel({});
    expect(within(panel).getByRole("banner")).toHaveTextContent(
      "This key is encrypted, stored locally and only used to make API requests from Forge.",
    );
    expect(panel).toHaveTextContent("You can get your Anthropic API key by signing up here.");
    const link = within(panel).getByRole("link", { name: "signing up here" });
    expect(link).toHaveAttribute("href", "https://platform.claude.com/settings/keys");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the default base URL and starts on the built-in models", async () => {
    const { panel } = await openPanel({});
    expect(panel).toHaveTextContent("Default: https://api.example.com");
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Use custom base URL" }));
    expect(panel).toHaveTextContent("Default: https://api.example.com");
    expect(within(panel).getByLabelText("Base URL")).not.toHaveAttribute("placeholder");
    expect(panel).toHaveTextContent("Using the built-in list");
    expect(within(panel).getByLabelText("Model ID 1")).toHaveValue("m1");
    expect(within(panel).getByLabelText("Display name 1")).toHaveValue("Model 1");
    expect(panel).not.toHaveTextContent("will be shown in the selector");
    expect(within(panel).queryByRole("button", { name: "Restore defaults" })).toBeNull();
  });

  it("saves a base URL along with the key", async () => {
    const { fetch, panel } = await openPanel({
      "PUT /api/settings/providers/anthropic/customization": { ...none, base_url: "https://x" },
      "PUT /api/settings/providers/anthropic/key": saved,
    });
    await typeBaseUrl(panel, "https://x");
    await userEvent.type(within(panel).getByLabelText(/api key/i), "sk-1");
    await userEvent.click(within(panel).getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    const [first, second] = calls(fetch, "PUT");
    expect(String(first[0])).toContain("/customization");
    expect(JSON.parse(String(first[1]?.body))).toEqual({ base_url: "https://x", models: null });
    expect(String(second[0])).toContain("/key");
  });

  it("shows a saved base URL with its checkbox ticked", async () => {
    const { panel } = await openPanel({}, { ...saved, base_url: "https://saved" });
    expect(within(panel).getByRole("checkbox", { name: "Use custom base URL" })).toBeChecked();
    expect(within(panel).getByLabelText("Base URL")).toHaveValue("https://saved");
  });

  it("clears the saved base URL when its checkbox is unticked", async () => {
    const { fetch, panel } = await openPanel(
      { "PUT /api/settings/providers/anthropic/customization": saved },
      { ...saved, base_url: "https://saved" },
    );
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Use custom base URL" }));
    expect(within(panel).queryByLabelText("Base URL")).toBeNull();
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(JSON.parse(String(calls(fetch, "PUT")[0][1]?.body))).toEqual({
      base_url: null,
      models: null,
    });
  });

  it("does not connect on settings alone", async () => {
    const { panel } = await openPanel({});
    await typeBaseUrl(panel, "https://x");
    expect(within(panel).getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("saves changes to a connected provider without touching its key", async () => {
    const { fetch, panel } = await openPanel(
      { "PUT /api/settings/providers/anthropic/customization": saved },
      saved,
    );
    const save = within(panel).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await typeBaseUrl(panel, "https://x");
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(calls(fetch, "PUT").map(([url]) => String(url))).toEqual([
      "/api/settings/providers/anthropic/customization",
    ]);
  });

  it("loads the provider's models as the sheet opens, using what the form shows", async () => {
    const { fetch, panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": listing,
    });
    await typeBaseUrl(panel, "https://x");
    await userEvent.type(within(panel).getByLabelText(/api key/i), "draft");
    const sheet = await openPicker(panel);

    const post = calls(fetch, "POST")[0];
    expect(JSON.parse(String(post[1]?.body))).toEqual({ base_url: "https://x", key: "draft" });
    expect(within(sheet).getByRole("tab", { name: "From provider" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(within(sheet).getByRole("button", { name: "Add models" })).toBeDisabled();
    expect(calls(fetch, "PUT")).toHaveLength(0);
  });

  it("has no separate fetch button on the page", async () => {
    const { panel } = await openPanel({});
    expect(within(panel).queryByRole("button", { name: /fetch/i })).toBeNull();
  });

  it("adds the ticked models after the existing ones, with search and select all", async () => {
    const { fetch, panel } = await openPanel(
      {
        "POST /api/settings/providers/anthropic/models/fetch": listing,
        "PUT /api/settings/providers/anthropic/customization": saved,
      },
      saved,
    );
    const sheet = await openPicker(panel);

    await userEvent.type(within(sheet).getByLabelText("Search models"), "gam");
    expect(within(sheet).getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.click(within(sheet).getByRole("button", { name: "Select all" }));
    expect(within(sheet).getByRole("button", { name: "Deselect all" })).toBeInTheDocument();
    await userEvent.clear(within(sheet).getByLabelText("Search models"));
    await userEvent.click(within(sheet).getByLabelText(/alpha/i));
    await userEvent.click(within(sheet).getByRole("button", { name: "Add 2 models" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const main = screen.getByRole("form");
    // The model that was first, and so the default, stays first.
    expect(within(main).getByLabelText("Model ID 1")).toHaveValue("m1");
    expect(within(main).getByLabelText("Model ID 2")).toHaveValue("alpha");
    expect(within(main).getByLabelText("Display name 3")).toHaveValue("Gamma");
    expect(main).toHaveTextContent("Customized model list");

    await userEvent.click(within(main).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(JSON.parse(String(calls(fetch, "PUT")[0][1]?.body))).toEqual({
      base_url: null,
      models: [
        { id: "m1", name: "Model 1" },
        { id: "alpha", name: "Alpha" },
        { id: "gamma", name: "Gamma" },
      ],
    });
  });

  it("does not lose ticks when switching to the manual tab and back", async () => {
    const { panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": listing,
    });
    const sheet = await openPicker(panel);
    await userEvent.click(within(sheet).getByLabelText(/alpha/i));
    await userEvent.click(within(sheet).getByRole("tab", { name: "Enter manually" }));
    await userEvent.click(within(sheet).getByRole("tab", { name: "From provider" }));
    expect(within(sheet).getByLabelText(/alpha/i)).toBeChecked();
    expect(within(sheet).getByRole("button", { name: "Add 1 model" })).toBeEnabled();
  });

  it("marks models already in the list, and keeps their edited names", async () => {
    const { panel } = await openPanel(
      { "POST /api/settings/providers/anthropic/models/fetch": listing },
      {
        ...saved,
        models: [
          { id: "alpha", name: "My Alpha" },
          { id: "mine", name: "Mine" },
        ],
      },
    );
    const sheet = await openPicker(panel);
    const alpha = within(sheet).getByLabelText(/alpha/i);
    expect(alpha).toBeChecked();
    expect(alpha).toBeDisabled();
    expect(within(sheet).getByText("Added")).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: "Select all" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Add 2 models" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const main = screen.getByRole("form");
    expect(within(main).getByLabelText("Display name 1")).toHaveValue("My Alpha");
    expect(within(main).getByLabelText("Model ID 2")).toHaveValue("mine");
    expect(within(main).getByLabelText("Model ID 3")).toHaveValue("beta");
    expect(within(main).queryByLabelText("Model ID 5")).toBeNull();
  });

  it("edits, orders, deletes, adds and restores models", async () => {
    const { panel } = await openPanel(
      {},
      {
        ...saved,
        models: [
          { id: "one", name: "One" },
          { id: "two", name: "Two" },
        ],
      },
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Move model 2 up" }));
    expect(within(panel).getByLabelText("Model ID 1")).toHaveValue("two");
    await userEvent.click(within(panel).getByRole("button", { name: "Delete model 1" }));
    expect(within(panel).getByLabelText("Model ID 1")).toHaveValue("one");
    await addModel(panel, "three");
    expect(within(panel).getByLabelText("Model ID 2")).toHaveValue("three");
    await userEvent.click(within(panel).getByRole("button", { name: "Restore defaults" }));
    expect(panel).toHaveTextContent("Using the built-in list");
    expect(within(panel).getByLabelText("Model ID 1")).toHaveValue("m1");
    expect(within(panel).queryByLabelText("Model ID 2")).toBeNull();
  });

  it("opens a sheet from Add model, needing only an ID to enter one by hand", async () => {
    const { panel } = await openPanel({});
    const sheet = await openManual(panel);

    expect(sheet).toHaveAttribute("data-side", "right");
    const add = within(sheet).getByRole("button", { name: "Add model" });
    expect(add).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText("Model ID"), "  ");
    expect(add).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText("Model ID"), "new-model");
    expect(add).toBeEnabled();
    await userEvent.click(within(sheet).getAllByRole("button", { name: "Cancel" })[0]);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(panel).toHaveTextContent("Using the built-in list");
  });

  it("sends no model list until a built-in model is changed", async () => {
    const { fetch, panel } = await openPanel(
      { "PUT /api/settings/providers/anthropic/customization": saved },
      saved,
    );
    const save = within(panel).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.type(within(panel).getByLabelText("Display name 1"), "!");

    expect(panel).toHaveTextContent("Customized model list");
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(JSON.parse(String(calls(fetch, "PUT")[0][1]?.body)).models).toEqual([
      { id: "m1", name: "Model 1!" },
    ]);
  });

  it("does not let a provider's last model be deleted", async () => {
    const { panel } = await openPanel({});
    expect(within(panel).getByRole("button", { name: "Delete model 1" })).toBeDisabled();
  });

  it("adds to the built-in models rather than replacing them", async () => {
    const { panel } = await openPanel({});
    await addModel(panel, "new-model", "New Model");
    expect(within(panel).getByLabelText("Model ID 1")).toHaveValue("m1");
    expect(within(panel).getByLabelText("Model ID 2")).toHaveValue("new-model");
    expect(within(panel).getByLabelText("Display name 2")).toHaveValue("New Model");
  });

  it("uses the ID as the display name when none is given", async () => {
    const { panel } = await openPanel({});
    await addModel(panel, "new-model");
    expect(within(panel).getByLabelText("Display name 2")).toHaveValue("new-model");
  });

  it("refuses a model already in the list", async () => {
    const { panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": listing,
    });
    const sheet = await openManual(panel);
    await userEvent.type(within(sheet).getByLabelText("Model ID"), "m1");
    expect(within(sheet).getByRole("alert")).toHaveTextContent("already in the list");
    expect(within(sheet).getByRole("button", { name: "Add model" })).toBeDisabled();
  });

  it("pressing Enter in the sheet adds the model without saving the provider", async () => {
    const { fetch, panel } = await openPanel({}, saved);
    const sheet = await openManual(panel);
    await userEvent.type(within(sheet).getByLabelText("Model ID"), "new-model{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(panel).getByLabelText("Model ID 2")).toHaveValue("new-model");
    expect(calls(fetch, "PUT")).toHaveLength(0);
  });

  it("says in the sheet why models could not be loaded, and can try again", async () => {
    let attempts = 0;
    const { panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 502, body: { error: "model API returned 401: bad key" } }
          : { body: listing };
      },
    });
    await userEvent.type(within(panel).getByLabelText(/api key/i), "draft");
    await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
    const sheet = screen.getByRole("dialog", { name: "Add model" });

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("bad key");
    expect(within(panel).getByLabelText(/api key/i)).toHaveValue("draft");

    await userEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(await within(sheet).findAllByRole("checkbox")).toHaveLength(3);
  });

  it("points to manual entry when models cannot be loaded", async () => {
    const { panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": () => ({
        status: 400,
        body: { error: "enter an API key to fetch models" },
      }),
    });
    await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
    const sheet = screen.getByRole("dialog", { name: "Add model" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("enter an API key");

    await userEvent.click(within(sheet).getByRole("button", { name: /enter a model id/i }));
    expect(within(sheet).getByLabelText("Model ID")).toBeVisible();
  });

  it("says when a provider lists nothing", async () => {
    const { panel } = await openPanel({
      "POST /api/settings/providers/anthropic/models/fetch": [],
    });
    await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
    const sheet = screen.getByRole("dialog", { name: "Add model" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("no models");
  });
});

describe("SettingsPage — custom providers", () => {
  const added: ProviderKeyStatus = {
    provider: "my-gateway",
    name: "My Gateway",
    description: "https://gw.example.com/v1",
    hint: "…5678",
    source: "settings",
    env_var: "",
    custom: true,
    base_url: null,
    default_base_url: "https://gw.example.com/v1",
    models: null,
    default_models: [],
    key_valid: true,
  };

  async function open(routes: Record<string, unknown> = {}) {
    const fetch = fakeFetch({ "GET /api/settings/providers": [none], ...routes });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: /custom provider/i }));
    return { fetch, panel: screen.getByRole("form", { name: "Custom provider" }) };
  }

  async function fillDetails(panel: HTMLElement) {
    await userEvent.type(within(panel).getByLabelText("Provider ID"), "my-gateway");
    await userEvent.type(within(panel).getByLabelText("Display name"), "My Gateway");
    await userEvent.type(within(panel).getByLabelText("Base URL"), "https://gw.example.com/v1");
    await userEvent.type(within(panel).getByLabelText("API key"), "gw-secret-5678");
  }

  it("is offered last, even when every other provider is connected", async () => {
    fakeFetch({ "GET /api/settings/providers": [saved] });
    render(<SettingsPage section="providers" />);
    expect(await rowsOf("Popular providers")).toEqual(["Custom provider"]);
    expect(screen.getByRole("listitem", { name: "Custom provider" })).toHaveTextContent(
      "Add a custom provider by base URL.",
    );
  });

  it("offers the three API protocols, starting on chat completions", async () => {
    const { panel } = await open();
    const select = within(panel).getByLabelText("API protocol");
    expect(select).toHaveValue("openai_chat");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["OpenAI Chat Completions", "OpenAI Responses", "Anthropic Messages"]);
  });

  it("creates a provider once every field and a model are filled in", async () => {
    const { fetch, panel } = await open({ "POST /api/settings/custom-providers": added });
    const create = within(panel).getByRole("button", { name: "Create provider" });
    expect(create).toBeDisabled();
    expect(within(panel).getByLabelText("API key")).toHaveAttribute("type", "password");

    await fillDetails(panel);
    expect(create).toBeDisabled();
    await addModel(panel, "model-a");
    await userEvent.selectOptions(
      within(panel).getByLabelText("API protocol"),
      "anthropic_messages",
    );
    await userEvent.click(create);

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(await rowsOf("Connected providers")).toEqual(["My Gateway"]);
    expect(screen.getByRole("listitem", { name: "My Gateway" })).toHaveTextContent("Custom");
    expect(document.body).not.toHaveTextContent("secret");
    const post = fetch.mock.calls.find(
      ([url, init]) => init?.method === "POST" && String(url).endsWith("/custom-providers"),
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      id: "my-gateway",
      name: "My Gateway",
      base_url: "https://gw.example.com/v1",
      protocol: "anthropic_messages",
      key: "gw-secret-5678",
      models: [{ id: "model-a", name: "model-a" }],
    });
  });

  it("fetches models from what the form shows, keeping what was typed", async () => {
    const { fetch, panel } = await open({
      "POST /api/settings/custom-providers/models": [{ id: "fetched", name: "Fetched" }],
    });
    await fillDetails(panel);
    await userEvent.selectOptions(within(panel).getByLabelText("API protocol"), "openai_responses");
    const sheet = await openPicker(panel);

    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      base_url: "https://gw.example.com/v1",
      protocol: "openai_responses",
      key: "gw-secret-5678",
    });
    await userEvent.click(within(sheet).getByLabelText(/fetched/i));
    await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 model" }));

    const form = await screen.findByRole("form", { name: "Custom provider" });
    await waitFor(() => expect(within(form).getByLabelText("Model ID 1")).toHaveValue("fetched"));
    expect(within(form).getByLabelText("Provider ID")).toHaveValue("my-gateway");
    expect(within(form).getByRole("button", { name: "Create provider" })).toBeEnabled();
  });

  it("asks for a URL and key before fetching", async () => {
    const { fetch, panel } = await open();
    await userEvent.click(within(panel).getByRole("button", { name: "Add model" }));
    const sheet = screen.getByRole("dialog", { name: "Add model" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Enter a base URL and an API key",
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("keeps the page open and says why a provider was refused", async () => {
    const { panel } = await open({
      "POST /api/settings/custom-providers": () => ({
        status: 400,
        body: { error: "use https:// so the API key is not sent in the clear" },
      }),
    });
    await fillDetails(panel);
    await addModel(panel, "model-a");
    await userEvent.click(within(panel).getByRole("button", { name: "Create provider" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("use https://");
  });

  it("disconnecting removes it from the page", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [added],
      "DELETE /api/settings/custom-providers/my-gateway": null,
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("No connected providers")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "My Gateway" })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  });

  it("does not mention an environment variable when changing its key", async () => {
    fakeFetch({ "GET /api/settings/providers": [added] });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("form")).not.toHaveTextContent("before starting Forge");
  });
});

describe("SettingsPage — testing a key", () => {
  it("offers no test until there is a key", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).queryByRole("button", { name: /test key/i })).not.toBeInTheDocument();
  });

  it("says when the provider accepts the key", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "POST /api/settings/providers/anthropic/key/test": { ok: true, message: null },
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    await userEvent.click(within(row).getByRole("button", { name: /test key/i }));
    expect(await within(row).findByRole("status")).toHaveTextContent(/accepted this key/i);
  });

  it("shows the provider's reason when it rejects the key", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "POST /api/settings/providers/anthropic/key/test": {
        ok: false,
        message: "model API returned 401: invalid x-api-key",
      },
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    await userEvent.click(within(row).getByRole("button", { name: /test key/i }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("invalid x-api-key");
  });

  const posts = (fetch: ReturnType<typeof fakeFetch>) =>
    fetch.mock.calls.filter(([, init]) => init?.method === "POST");

  it("shows a saved key as green without calling the provider", async () => {
    const fetch = fakeFetch({ "GET /api/settings/providers": [saved] });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).getByRole("img", { name: "API key valid" })).toHaveClass("bg-green-500");
    expect(posts(fetch)).toHaveLength(0);
  });

  it("shows a key that failed its last test as red without calling the provider", async () => {
    const fetch = fakeFetch({ "GET /api/settings/providers": [{ ...saved, key_valid: false }] });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).getByRole("img", { name: "API key not valid" })).toHaveClass(
      "bg-destructive",
    );
    expect(posts(fetch)).toHaveLength(0);
  });

  it("shows an untested key from the environment as grey", async () => {
    const fetch = fakeFetch({
      "GET /api/settings/providers": [{ ...saved, source: "environment", key_valid: null }],
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).getByRole("img", { name: "API key not tested" })).toBeVisible();
    expect(posts(fetch)).toHaveLength(0);
  });

  it("does not mark a provider with no key", async () => {
    fakeFetch({ "GET /api/settings/providers": [none] });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).queryByRole("img", { name: /api key/i })).toBeNull();
  });

  it("turns red when Test key fails, and green when it passes", async () => {
    let answer: { ok: boolean; message: string | null } = { ok: false, message: "rejected" };
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "POST /api/settings/providers/anthropic/key/test": () => ({ body: answer }),
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });

    await userEvent.click(within(row).getByRole("button", { name: /test key/i }));
    expect(await within(row).findByRole("img", { name: "API key not valid" })).toBeVisible();
    expect(within(row).getByRole("alert")).toHaveTextContent("rejected");

    answer = { ok: true, message: null };
    await userEvent.click(within(row).getByRole("button", { name: /test key/i }));
    expect(await within(row).findByRole("img", { name: "API key valid" })).toBeVisible();
    expect(within(row).queryByRole("alert")).toBeNull();
  });

  it("keeps the dot as it was when the test request itself fails", async () => {
    fakeFetch({ "GET /api/settings/providers": [saved] });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    await userEvent.click(within(row).getByRole("button", { name: /test key/i }));
    expect(await within(row).findByRole("alert")).toBeVisible();
    expect(within(row).getByRole("img", { name: "API key valid" })).toBeVisible();
  });

  it("turns green after a successful save, clearing the old failure", async () => {
    fakeFetch({
      "GET /api/settings/providers": [saved],
      "POST /api/settings/providers/anthropic/key/test": { ok: false, message: "rejected" },
      "PUT /api/settings/providers/anthropic/key": { ...saved, hint: "…1234" },
    });
    render(<SettingsPage section="providers" />);
    await userEvent.click(await screen.findByRole("button", { name: /test key/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rejected");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const panel = screen.getByRole("form");
    await userEvent.type(within(panel).getByLabelText(/api key/i), "sk-new-1234");
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(await screen.findByRole("img", { name: "API key valid" })).toBeVisible();
    expect(screen.queryByText("rejected")).not.toBeInTheDocument();
  });

  it("can test a key that comes from the environment", async () => {
    fakeFetch({
      "GET /api/settings/providers": [{ ...saved, source: "environment" }],
    });
    render(<SettingsPage section="providers" />);
    const row = await screen.findByRole("listitem", { name: "Anthropic" });
    expect(within(row).getByRole("button", { name: /test key/i })).toBeEnabled();
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
    render(<SettingsPage section="defaults" />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-sonnet-5-5"),
    );
    expect(within(form).getByLabelText(/reasoning effort/i)).toHaveValue("low");
    expect(within(form).getByLabelText(/approval mode/i)).toHaveValue("full_auto");
  });

  it("starts from the catalog default when no model is saved", async () => {
    fakeFetch(routes({ model: null, approval_mode: "ask" }));
    render(<SettingsPage section="defaults" />);
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
    render(<SettingsPage section="defaults" />);
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
    render(<SettingsPage section="defaults" />);
    const form = await screen.findByRole("form", { name: /new session defaults/i });
    await waitFor(() =>
      expect(within(form).getByLabelText(/^model$/i)).toHaveValue("claude-opus-5-5"),
    );
    await userEvent.click(within(form).getByRole("button", { name: /save defaults/i }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("no model x");
  });
});

describe("SettingsPage — GitHub", () => {
  const base = { "GET /api/settings/providers": [none] };

  it("connects with a token and shows the account", async () => {
    const fetch = fakeFetch({
      ...base,
      "GET /api/settings/github": { connected: false, login: null },
      "PUT /api/settings/github": { connected: true, login: "octo" },
    });
    render(<SettingsPage section="github" />);
    const section = await screen.findByRole("region", { name: /github/i });
    const input = await within(section).findByLabelText(/github token/i);
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "ghp_abc");
    await userEvent.click(within(section).getByRole("button", { name: /connect github/i }));

    expect(await within(section).findByText(/connected as @octo/i)).toBeInTheDocument();
    expect(section).not.toHaveTextContent("ghp_abc");
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ token: "ghp_abc" });
  });

  it("shows why a token was refused", async () => {
    fakeFetch({
      ...base,
      "GET /api/settings/github": { connected: false, login: null },
      "PUT /api/settings/github": () => ({
        status: 400,
        body: { error: "GitHub did not accept this token" },
      }),
    });
    render(<SettingsPage section="github" />);
    const section = await screen.findByRole("region", { name: /github/i });
    await userEvent.type(await within(section).findByLabelText(/github token/i), "bad");
    await userEvent.click(within(section).getByRole("button", { name: /connect github/i }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("did not accept");
  });

  it("disconnects a connected account", async () => {
    fakeFetch({
      ...base,
      "GET /api/settings/github": { connected: true, login: "octo" },
      "DELETE /api/settings/github": { connected: false, login: null },
    });
    render(<SettingsPage section="github" />);
    const section = await screen.findByRole("region", { name: /github/i });
    await userEvent.click(await within(section).findByRole("button", { name: /disconnect/i }));
    expect(await within(section).findByLabelText(/github token/i)).toBeInTheDocument();
  });
});
