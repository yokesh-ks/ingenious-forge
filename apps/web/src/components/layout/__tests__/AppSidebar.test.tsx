import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fakeFetch } from "@/test/fake-fetch";
import AppSidebar from "../AppSidebar";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("AppSidebar", () => {
  it("shows the Forge home link, projects, and the footer actions", async () => {
    fakeFetch({ "GET /api/projects": [] });
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );
    expect(screen.getByRole("link", { name: /ingenious forge/i })).toHaveAttribute("href", "/");
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("button", { name: /switch to (dark|light) theme/i }),
    ).toBeInTheDocument();
  });
});
