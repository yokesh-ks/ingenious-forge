import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalInput, TerminalNotice } from "@/api/types";

export type TerminalStatus = "connecting" | "open" | "exited" | "closed";

interface Options {
  createSocket?: (url: string) => WebSocket;
  /** A workspace panel tab with its own shell; none means the project's. */
  tab?: string;
  /** The shell a new terminal runs; none means the server's default. */
  shell?: string;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);

/** The WebSocket URL of a project's terminal, on the page's own host. */
export function terminalSocketUrl(
  location: Pick<Location, "protocol" | "host">,
  projectId: string,
  tab?: string,
  shell?: string,
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (shell) params.set("shell", shell);
  const query = params.size > 0 ? `?${params}` : "";
  return `${scheme}//${location.host}/api/projects/${encodeURIComponent(projectId)}/terminal${query}`;
}

/**
 * Connects to a project's terminal. Output bytes go to `onOutput`; the
 * shell keeps running on the server when this unmounts.
 */
export function useTerminal(
  projectId: string,
  onOutput: (bytes: Uint8Array) => void,
  { createSocket = defaultCreateSocket, tab, shell }: Options = {},
) {
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [generation, setGeneration] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const output = useRef(onOutput);
  output.current = onOutput;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` reconnects on restart
  useEffect(() => {
    setStatus("connecting");
    const socket = createSocket(terminalSocketUrl(window.location, projectId, tab, shell));
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    let exited = false;
    socket.onopen = () => setStatus("open");
    socket.onclose = () => setStatus(exited ? "exited" : "closed");
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data !== "string") {
        output.current(new Uint8Array(event.data));
        return;
      }
      try {
        const notice = JSON.parse(event.data) as TerminalNotice;
        if (notice.type === "exit") {
          exited = true;
          setStatus("exited");
        }
      } catch {
        // Not a notice; ignore it.
      }
    };
    return () => {
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    };
  }, [projectId, tab, createSocket, generation]);

  const post = useCallback((message: TerminalInput) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const send = useCallback((data: string) => post({ type: "input", data }), [post]);
  const resize = useCallback(
    (cols: number, rows: number) => post({ type: "resize", cols, rows }),
    [post],
  );
  const restart = useCallback(() => setGeneration((g) => g + 1), []);

  return { status, send, resize, restart };
}
