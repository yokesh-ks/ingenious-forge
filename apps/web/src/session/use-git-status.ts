import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { GitStatus } from "@/api/types";
import { sessionSocketUrl } from "./use-session";

interface Options {
  createSocket?: (url: string) => WebSocket;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);

/** Events after which files on disk may have changed. */
const REFRESH_ON = new Set([
  "file_changed",
  "changes_reverted",
  "tool_result",
  "done",
  "error",
  "interrupted",
]);

/** The project's branch and change counts, kept current as the agent works. */
export function useGitStatus(
  projectId: string,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.gitStatus(projectId).then(
      (found) => {
        setStatus(found);
        setError(null);
      },
      (err: Error) => {
        setStatus(null);
        setError(err.message);
      },
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
        // Not an event.
      }
    };
    return () => socket.close();
  }, [reload, createSocket]);

  return { status, error, reload };
}
