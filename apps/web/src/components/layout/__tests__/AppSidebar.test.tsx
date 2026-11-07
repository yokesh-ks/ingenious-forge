import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fakeFetch } from "@/test/fake-fetch";
import AppSidebar from "../AppSidebar";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("AppSidebar", () => {
  it("shows the Work title, its collapse toggle and the projects", async () => {
    fakeFetch({ "GET /api/projects": [] });
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );
    expect(screen.getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse sidebar/i })).toBeInTheDocument();
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });
});
