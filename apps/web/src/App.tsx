import { useEffect } from "react";
import AppBreadcrumb from "@/components/layout/AppBreadcrumb";
import AppRail from "@/components/layout/AppRail";
import AppSidebar from "@/components/layout/AppSidebar";
import { sectionForPath } from "@/components/layout/app-sections";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import SettingsSidebar from "@/features/settings/components/SettingsSidebar";
import { SETTINGS_SECTIONS, settingsSectionForPath } from "@/features/settings/settings-sections";
import { Link, matchPath, navigate, usePath } from "@/lib/router";
import ComingSoonPage from "@/pages/ComingSoonPage";
import EmptyMainView from "@/pages/EmptyMainView";
import ProjectPage from "@/pages/ProjectPage";
import SettingsPage from "@/pages/SettingsPage";

function Page({ path }: { path: string }) {
  if (matchPath("/", path)) return <EmptyMainView />;
  const settingsPage = settingsSectionForPath(path);
  if (settingsPage) return <SettingsPage key={settingsPage.id} section={settingsPage.id} />;
  // Replaced straight away: see `useSettingsOpensItsFirstPage`.
  if (matchPath("/settings", path)) return null;
  const section = sectionForPath(path);
  if (section?.comingSoon) return <ComingSoonPage title={section.label} />;
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

/** The page header's sidebar toggle, shown once the sidebar's own toggle is out of view. */
function ReopenSidebarTrigger() {
  const { isMobile, state } = useSidebar();
  if (!isMobile && state === "expanded") return null;
  return <SidebarTrigger aria-label="Open sidebar" />;
}

/**
 * Keeps Cmd/Ctrl+B for whoever is being typed in (the composer, the terminal):
 * the sidebar's own shortcut listens on `window`, so stopping here shields it.
 */
function useTextFieldsKeepSidebarShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "b" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable]")) {
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** `/settings` has no page of its own: it opens the first one. */
function useSettingsOpensItsFirstPage(path: string) {
  useEffect(() => {
    if (matchPath("/settings", path)) navigate(SETTINGS_SECTIONS[0].to, { replace: true });
  }, [path]);
}

export default function App() {
  const path = usePath();
  const sectionId = sectionForPath(path)?.id;
  const onWork = sectionId === "work";
  const onSettings = sectionId === "settings";
  useTextFieldsKeepSidebarShortcut();
  useSettingsOpensItsFirstPage(path);

  return (
    <div className="flex h-svh flex-col bg-sidebar">
      <Toaster />
      <div className="flex min-h-0 flex-1">
        <AppRail path={path} />
        <div className="flex min-w-0 flex-1 overflow-clip bg-background">
          {/* `contain-layout` makes this box, not the viewport, anchor the fixed sidebars. */}
          <SidebarProvider
            className="h-full min-h-0 contain-layout"
            style={{ "--sidebar-width": "15.625rem" } as React.CSSProperties}
          >
            {onWork && <AppSidebar />}
            {onSettings && <SettingsSidebar path={path} />}
            <SidebarInset className="min-h-0 min-w-0">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                {(onWork || onSettings) && <ReopenSidebarTrigger />}
                <AppBreadcrumb path={path} />
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Page path={path} />
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </div>
    </div>
  );
}
