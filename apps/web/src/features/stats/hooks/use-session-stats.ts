import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { SessionStats } from "@/api/types";

/**
 * A session's totals from the server's fold of its whole log, reloaded
 * whenever `refreshKey` changes (a step settles or a turn ends). Keeps the
 * last reading when a reload fails.
 */
export function useSessionStats(sessionId: string, refreshKey: string): SessionStats | null {
  const [stats, setStats] = useState<SessionStats | null>(null);
  useEffect(() => {
    let live = true;
    // The key only says when to reload.
    void refreshKey;
    api
      .sessionStats(sessionId)
      .then((next) => {
        if (live) setStats(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sessionId, refreshKey]);
  return stats;
}
