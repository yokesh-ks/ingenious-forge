import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar";
import ProjectsNav from "@/features/session/components/ProjectsNav";

/** The Work section's sidebar: its title, its collapse toggle and the project tree. */
export default function AppSidebar() {
  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="h-full [&>[data-slot=sidebar-inner]]:bg-background"
    >
      <SidebarHeader className="flex-row items-center justify-between px-4 py-2.5">
        <h2 className="text-base font-semibold">Work</h2>
        <SidebarTrigger aria-label="Collapse sidebar" />
      </SidebarHeader>
      <SidebarContent>
        <ProjectsNav />
      </SidebarContent>
    </Sidebar>
  );
}
