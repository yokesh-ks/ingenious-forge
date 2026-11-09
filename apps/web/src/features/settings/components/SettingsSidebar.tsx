import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@/lib/router";
import { SETTINGS_SECTIONS, settingsSectionForPath } from "../settings-sections";

/** The Settings section's sidebar: its title, its collapse toggle and its pages. */
export default function SettingsSidebar({ path }: { path: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = settingsSectionForPath(path)?.id;

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="h-full [&>[data-slot=sidebar-inner]]:bg-background"
    >
      <SidebarHeader className="flex-row items-center justify-between px-4 py-2.5">
        <h2 className="text-[26px] leading-[28px] font-display font-bold">Settings</h2>
        <SidebarTrigger aria-label="Collapse sidebar" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Settings">
            <SidebarMenu>
              {SETTINGS_SECTIONS.map((section) => (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton asChild isActive={section.id === active}>
                    <Link
                      to={section.to}
                      aria-current={section.id === active ? "page" : undefined}
                      onClick={() => isMobile && setOpenMobile(false)}
                    >
                      <section.icon />
                      <span>{section.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
