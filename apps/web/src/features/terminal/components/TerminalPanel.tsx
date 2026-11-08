import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTerminal } from "@/features/terminal/hooks/use-terminal";
import { useTheme } from "@/hooks/use-theme";

/** The terminal's colours, taken from the page's current theme. */
function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim() || undefined;
  return {
    background: color("--background"),
    foreground: color("--foreground"),
    cursor: color("--foreground"),
    cursorAccent: color("--background"),
    selectionBackground: color("--accent"),
  };
}

/** An interactive shell in the project folder (ADR 0007). */
export default function TerminalPanel({
  projectId,
  tab,
  shell,
}: {
  projectId: string;
  tab?: string;
  shell?: string;
}) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { status, send, resize, restart } = useTerminal(
    projectId,
    (bytes) => term.current?.write(bytes),
    { tab, shell },
  );
  const input = useRef(send);
  input.current = send;
  const sizeTo = useRef(resize);
  sizeTo.current = resize;

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: themeColors(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    if (container.current) terminal.open(container.current);
    term.current = terminal;
    const typed = terminal.onData((data) => input.current(data));
    const fitNow = () => {
      try {
        fit.fit();
        sizeTo.current(terminal.cols, terminal.rows);
      } catch {
        // Not laid out yet (hidden tab); the next resize fits it.
      }
    };
    fitNow();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => fitNow());
    if (container.current) observer?.observe(container.current);
    return () => {
      observer?.disconnect();
      typed.dispose();
      terminal.dispose();
      term.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new theme means new colours
  useEffect(() => {
    if (term.current) term.current.options.theme = themeColors();
  }, [theme]);

  // Send the size again once connected, so the shell gets it.
  useEffect(() => {
    if (status === "open" && term.current) resize(term.current.cols, term.current.rows);
  }, [status, resize]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {status === "connecting" && (
        <p role="status" className="text-xs text-muted-foreground">
          Connecting to the terminal…
        </p>
      )}
      {status === "closed" && (
        <p role="status" className="text-xs text-muted-foreground">
          Disconnected from the terminal.{" "}
          <Button size="sm" variant="link" className="h-auto p-0" onClick={restart}>
            Reconnect
          </Button>
        </p>
      )}
      {status === "exited" && (
        <p role="status" className="text-xs text-muted-foreground">
          The shell exited.{" "}
          <Button size="sm" variant="link" className="h-auto p-0" onClick={restart}>
            Restart
          </Button>
        </p>
      )}
      <div ref={container} data-testid="terminal" className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
