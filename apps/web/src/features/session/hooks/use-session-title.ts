import { useProjectSessions } from "./use-project-sessions";

/** A session's current title, for display (e.g. the breadcrumb header). */
export function useSessionTitle(projectId: string | null, sessionId: string | null) {
  const { sessions } = useProjectSessions(sessionId === null ? null : projectId);
  return sessions?.find((session) => session.id === sessionId)?.title ?? null;
}
