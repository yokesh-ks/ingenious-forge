import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SandboxInfo } from "@/api/types";
import SandboxBadge from "../../components/SandboxBadge";

const info = (over: Partial<SandboxInfo> = {}): SandboxInfo => ({
  name: "sandbox-exec",
  active: true,
  writable: ["/Users/me/code/forge"],
  network: false,
  problem: null,
  ...over,
});

describe("SandboxBadge", () => {
  it("shows the sandbox, the writable folders and the network rule", () => {
    render(<SandboxBadge sandbox={info({ writable: ["/Users/me/code/forge", "/tmp/cache"] })} />);
    const badge = screen.getByRole("group", { name: /sandbox/i });
    expect(badge).toHaveTextContent("sandbox-exec");
    expect(badge).toHaveTextContent("forge");
    expect(badge).toHaveTextContent("cache");
    expect(screen.getByTitle("/Users/me/code/forge")).toBeInTheDocument();
    expect(badge).toHaveTextContent(/no network/i);
  });

  it("says when the network is allowed", () => {
    render(<SandboxBadge sandbox={info({ network: true })} />);
    expect(screen.getByRole("group", { name: /sandbox/i })).toHaveTextContent(/network allowed/i);
  });

  it("warns when the sandbox is unavailable and says why", () => {
    render(
      <SandboxBadge
        sandbox={info({ name: "unavailable", active: false, problem: "install bubblewrap" })}
      />,
    );
    const badge = screen.getByRole("group", { name: /sandbox/i });
    expect(badge).toHaveTextContent(/sandbox unavailable/i);
    expect(badge).toHaveTextContent("install bubblewrap");
  });

  it("says when commands are not sandboxed", () => {
    render(<SandboxBadge sandbox={info({ name: "none", active: false })} />);
    expect(screen.getByRole("group", { name: /sandbox/i })).toHaveTextContent(/not sandboxed/i);
  });

  it("stays visible at every width", () => {
    render(<SandboxBadge sandbox={info()} />);
    expect(screen.getByRole("group", { name: /sandbox/i }).className).not.toMatch(/\bhidden\b/);
  });

  it("shows nothing until the sandbox is known", () => {
    const { container } = render(<SandboxBadge sandbox={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
