import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar";
import ProjectsNav from "@/features/session/components/ProjectsNav";
import logoUrl from "/logo.svg";

/** The Work section's sidebar: the Forge mark, its title, its collapse toggle and the project tree. */
export default function AppSidebar() {
  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="h-full [&>[data-slot=sidebar-inner]]:bg-background"
    >
      <SidebarHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Ingenious Clan"
            className="h-5 w-5 flex-none"
            width={20}
            height={20}
          />
          <h2 className="text-base font-semibold">Work</h2>
        </div>
        <SidebarTrigger aria-label="Collapse sidebar" />
      </SidebarHeader>
      <SidebarContent>
        <ProjectsNav />
      </SidebarContent>
    </Sidebar>
  );
}
