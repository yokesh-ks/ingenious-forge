import {
  CalendarClockIcon,
  GitPullRequestIcon,
  GlobeIcon,
  LayersIcon,
  type LucideIcon,
  PuzzleIcon,
  SettingsIcon,
  ShapesIcon,
} from "lucide-react";

export interface AppSection {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** True while the section is only a "coming soon" placeholder page. */
  comingSoon?: boolean;
}

/** The global icon rail's sections, in order (PRD §6.2 App navigation). */
export const APP_SECTIONS: AppSection[] = [
  { id: "work", label: "Work", to: "/", icon: LayersIcon },
  { id: "artifacts", label: "Artifacts", to: "/artifacts", icon: ShapesIcon, comingSoon: true },
  {
    id: "scheduled",
    label: "Scheduled",
    to: "/scheduled",
    icon: CalendarClockIcon,
    comingSoon: true,
  },
  { id: "plugins", label: "Plugins", to: "/plugins", icon: PuzzleIcon, comingSoon: true },
  { id: "sites", label: "Sites", to: "/sites", icon: GlobeIcon, comingSoon: true },
  {
    id: "code-review",
    label: "Code Review",
    to: "/code-review",
    icon: GitPullRequestIcon,
    comingSoon: true,
  },
  { id: "settings", label: "Settings", to: "/settings", icon: SettingsIcon },
];

/** The section `path` belongs to; `null` for a path no section owns. */
export function sectionForPath(path: string): AppSection | null {
  if (path === "/" || path.startsWith("/projects/")) {
    return APP_SECTIONS[0];
  }
  return APP_SECTIONS.find((section) => section.id !== "work" && section.to === path) ?? null;
}
