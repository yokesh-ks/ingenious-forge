import type { Session } from "@/api/types";
import { Link } from "@/lib/router";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface SessionSidebarProps {
  projectId: string;
  sessions: Session[] | null;
  activeId: string | null;
}

/** The project's sessions; choosing one opens it without a page load. */
export default function SessionSidebar({ projectId, sessions, activeId }: SessionSidebarProps) {
  return (
    <nav aria-label="Sessions" className="flex flex-col gap-1">
      {sessions === null && <p className="text-xs text-muted-foreground">Loading…</p>}
      {sessions?.map((session) => (
        <Link
          key={session.id}
          to={`/projects/${projectId}/sessions/${session.id}`}
          aria-current={session.id === activeId ? "page" : undefined}
          className={cn(
            "flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
            session.id === activeId && "bg-muted",
          )}
        >
          <span className="flex items-center gap-2">
            {session.running && (
              <span
                role="status"
                aria-label="Running"
                className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
              />
            )}
            <span className="truncate">{session.title}</span>
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(session.updated_at)}</span>
        </Link>
      ))}
    </nav>
  );
}
