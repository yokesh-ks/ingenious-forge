import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { SandboxInfo, SessionEvent } from "@/api/types";
import { sessionSocketUrl } from "@/features/session/hooks/use-session";

interface Options {
  createSocket?: (url: string) => WebSocket;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);

/** The sandbox a session's commands run in, kept current as it changes. */
export function useSandbox(
  sessionId: string | null,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [sandbox, setSandbox] = useState<SandboxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(sessionId);
  current.current = sessionId;

  useEffect(() => {
    let cancelled = false;
    setSandbox(null);
    setError(null);
    if (sessionId === null) return;
    api.sessionSandbox(sessionId).then(
      (found) => !cancelled && setSandbox(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // One socket for the hook's life; changes apply to the current session.
  useEffect(() => {
    const socket = createSocket(sessionSocketUrl(window.location));
    socket.onmessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as SessionEvent;
        if (event.type === "sandbox_changed" && event.session_id === current.current) {
          setSandbox(event.sandbox);
        }
      } catch {
        // Not an event.
      }
    };
    return () => socket.close();
  }, [createSocket]);

  return { sandbox, error };
}
