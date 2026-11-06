import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useProject } from "@/features/session/hooks/use-project";
import { useSessionTitle } from "@/features/session/hooks/use-session-title";
import { Link, matchPath } from "@/lib/router";

/** The sticky header's breadcrumb: home, the open project, the open session. */
export default function AppBreadcrumb({ path }: { path: string }) {
  const sessionMatch = matchPath("/projects/:id/sessions/:sessionId", path);
  const projectMatch = matchPath("/projects/:id", path);
  const projectId = sessionMatch?.id ?? projectMatch?.id ?? null;
  const { project } = useProject(projectId);
  const sessionTitle = useSessionTitle(projectId, sessionMatch?.sessionId ?? null);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {projectId === null ? (
            <BreadcrumbPage>Forge</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/">Forge</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {projectId !== null && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {sessionMatch ? (
                <BreadcrumbLink asChild>
                  <Link to={`/projects/${projectId}`}>{project?.name ?? projectId}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{project?.name ?? projectId}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}
        {sessionMatch && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{sessionTitle ?? sessionMatch.sessionId}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
