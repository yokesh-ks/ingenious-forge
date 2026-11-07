import { useCallback, useEffect, useMemo, useState } from "react";
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
  "turn_ended",
  "done",
  "error",
  "interrupted",
  "approval_mode_changed",
]);

/** Tells every mounted copy of a project's list (page, sidebar, breadcrumb) to refetch. */
const SESSIONS_CHANGED = "forge:sessions-changed";

interface SessionsChanged {
  projectId: string | null;
  /** A session gone from the list, dropped at once so nothing opens it meanwhile. */
  hidden?: string;
}

export function notifySessionsChanged(projectId: string | null, hidden?: string) {
  const detail: SessionsChanged = { projectId, hidden };
  window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED, { detail }));
}

/**
 * A project's sessions, kept current as turns start and end; `null` while there
 * is no project. Archived ones are apart, since only restoring them applies.
 */
export function useProjectSessions(
  projectId: string | null,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [all, setAll] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => notifySessionsChanged(projectId), [projectId]);

  useEffect(() => {
    setAll(null);
    if (projectId === null) return;
    const load = () =>
      api.listSessions(projectId).then(
        (list) => {
          setAll(list);
          setError(null);
        },
        (err: Error) => setError(err.message),
      );
    load();

    const onChanged = (event: Event) => {
      const { projectId: changed, hidden } = (event as CustomEvent<SessionsChanged>).detail;
      if (changed !== projectId) return;
      if (hidden) setAll((list) => list?.filter((s) => s.id !== hidden) ?? null);
      load();
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

  const sessions = useMemo(() => all?.filter((s) => !s.archived) ?? null, [all]);
  const archived = useMemo(() => all?.filter((s) => s.archived) ?? [], [all]);

  return { sessions, archived, error, reload };
}
