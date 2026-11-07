import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import ProjectPicker from "../../components/ProjectPicker";

const forge = { id: "p1", name: "forge", path: "/code/forge", last_opened_at: 2 };
const other = { id: "p2", name: "other", path: "/code/other", last_opened_at: 1 };

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("ProjectPicker", () => {
  it("shows the open project and marks it in the list", async () => {
    fakeFetch({ "GET /api/projects/p1": forge, "GET /api/projects": [forge, other] });
    render(<ProjectPicker projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Project: forge" }));
    expect(await screen.findByRole("menuitemradio", { name: "forge" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("choosing another project opens it", async () => {
    fakeFetch({ "GET /api/projects/p1": forge, "GET /api/projects": [forge, other] });
    render(<ProjectPicker projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Project: forge" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "other" }));
    await waitFor(() => expect(window.location.pathname).toBe("/projects/p2"));
  });

  it("says why the list could not load", async () => {
    fakeFetch({
      "GET /api/projects/p1": forge,
      "GET /api/projects": () => ({ status: 500, body: { error: "db locked" } }),
    });
    render(<ProjectPicker projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Project: forge" }));
    expect(await screen.findByText("db locked")).toBeInTheDocument();
  });
});
