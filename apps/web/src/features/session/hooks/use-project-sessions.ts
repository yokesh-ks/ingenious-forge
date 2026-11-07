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

/** Tells every mounted copy of a project's list (page, sidebar, breadcrumb) to refetch. */
const SESSIONS_CHANGED = "forge:sessions-changed";

/** A project's sessions, kept current as turns start and end; `null` while there is no project. */
export function useProjectSessions(
  projectId: string | null,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED, { detail: projectId }));
  }, [projectId]);

  useEffect(() => {
    setSessions(null);
    if (projectId === null) return;
    const load = () =>
      api.listSessions(projectId).then(
        (list) => {
          setSessions(list);
          setError(null);
        },
        (err: Error) => setError(err.message),
      );
    load();

    const onChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === projectId) load();
    };
    window.addEventListener(SESSIONS_CHANGED, onChanged);

    const socket = createSocket(sessionSocketUrl(window.location));
    socket.onmessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as { type?: unknown };
        if (typeof event.type === "string" && REFRESH_ON.has(event.type)) load();
      } catch {
        // Not an event; nothing to refresh.
      }
    };
    return () => {
      window.removeEventListener(SESSIONS_CHANGED, onChanged);
      socket.close();
    };
  }, [projectId, createSocket]);

  return { sessions, error, reload };
}
