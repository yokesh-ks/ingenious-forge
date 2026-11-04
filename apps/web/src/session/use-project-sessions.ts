import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Session } from "@/api/types";
import { sessionSocketUrl } from "./use-session";

interface Options {
  createSocket?: (url: string) => WebSocket;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);

/** Events after which a session's status, title or activity changed. */
const REFRESH_ON = new Set([
  "turn_started",
  "done",
  "error",
  "interrupted",
  "approval_mode_changed",
]);

/** A project's sessions, kept current as turns start and end. */
export function useProjectSessions(
  projectId: string,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.listSessions(projectId).then(
      (list) => {
        setSessions(list);
        setError(null);
      },
      (err: Error) => setError(err.message),
    );
  }, [projectId]);

  useEffect(() => {
    reload();
    const socket = createSocket(sessionSocketUrl(window.location));
    socket.onmessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as { type?: unknown };
        if (typeof event.type === "string" && REFRESH_ON.has(event.type)) reload();
      } catch {
        // Not an event; nothing to refresh.
      }
    };
    return () => socket.close();
  }, [reload, createSocket]);

  return { sessions, error, reload };
}
