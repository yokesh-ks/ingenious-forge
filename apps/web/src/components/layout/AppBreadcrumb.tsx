import { sectionForPath } from "@/components/layout/app-sections";
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
import { settingsSectionForPath } from "@/features/settings/settings-sections";
import { Link, matchPath } from "@/lib/router";

/** The page header's breadcrumb: the section, the open project, the open session. */
export default function AppBreadcrumb({ path }: { path: string }) {
  const sessionMatch = matchPath("/projects/:id/sessions/:sessionId", path);
  const projectMatch = matchPath("/projects/:id", path);
  const projectId = sessionMatch?.id ?? projectMatch?.id ?? null;
  const { project } = useProject(projectId);
  const sessionTitle = useSessionTitle(projectId, sessionMatch?.sessionId ?? null);
  const section = sectionForPath(path);
  const root = section && section.id !== "work" ? section.label : "Projects";
  const settingsPage = settingsSectionForPath(path);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {projectId === null ? (
            <BreadcrumbPage>{root}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/">{root}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {settingsPage && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{settingsPage.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
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
