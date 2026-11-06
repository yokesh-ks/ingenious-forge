import AppBreadcrumb from "@/components/layout/AppBreadcrumb";
import AppSidebar from "@/components/layout/AppSidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Link, matchPath, usePath } from "@/lib/router";
import EmptyMainView from "@/pages/EmptyMainView";
import ProjectPage from "@/pages/ProjectPage";
import SettingsPage from "@/pages/SettingsPage";

function Page({ path }: { path: string }) {
  if (matchPath("/", path)) return <EmptyMainView />;
  if (matchPath("/settings", path)) return <SettingsPage />;
  const session = matchPath("/projects/:id/sessions/:sessionId", path);
  if (session) {
    return <ProjectPage key={session.id} projectId={session.id} sessionId={session.sessionId} />;
  }
  const project = matchPath("/projects/:id", path);
  if (project) return <ProjectPage key={project.id} projectId={project.id} sessionId={null} />;
  return (
    <main className="px-4 py-6 text-sm text-muted-foreground">
      Page not found. <Link to="/">Go to your projects.</Link>
    </main>
  );
}

export default function App() {
  const path = usePath();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <AppBreadcrumb path={path} />
        </header>
        <Page path={path} />
      </SidebarInset>
    </SidebarProvider>
  );
}
