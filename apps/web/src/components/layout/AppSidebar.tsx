import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar";
import ProjectsNav from "@/features/session/components/ProjectsNav";

/** The Work section's sidebar: the Forge mark, its title, its collapse toggle and the project tree. */
export default function AppSidebar() {
  return (
    <Sidebar side="left" collapsible="offcanvas" className="h-full">
      <SidebarHeader className="flex-row items-center justify-between">
        <h2 className="text-[26px] leading-[28px] font-display font-bold">Work</h2>
        <SidebarTrigger aria-label="Collapse sidebar" />
      </SidebarHeader>
      <SidebarContent>
        <ProjectsNav />
      </SidebarContent>
    </Sidebar>
  );
}
