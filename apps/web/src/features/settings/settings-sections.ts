import {
  ArchiveIcon,
  GitBranchIcon,
  KeyRoundIcon,
  type LucideIcon,
  PaletteIcon,
  SlidersIcon,
} from "lucide-react";
import { matchPath } from "@/lib/router";

export type SettingsSectionId = "appearance" | "providers" | "defaults" | "github" | "archived";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  to: string;
  icon: LucideIcon;
}

/** The Settings sidebar's pages, in order (PRD §6.2 Settings). The first is
 * where Settings opens. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", label: "Appearance", to: "/settings/appearance", icon: PaletteIcon },
  { id: "providers", label: "Providers", to: "/settings/providers", icon: KeyRoundIcon },
  { id: "defaults", label: "Session defaults", to: "/settings/defaults", icon: SlidersIcon },
  { id: "github", label: "GitHub", to: "/settings/github", icon: GitBranchIcon },
  { id: "archived", label: "Archived Sessions", to: "/settings/archived", icon: ArchiveIcon },
];

/** The settings page at `path`; `null` for any other path. */
export function settingsSectionForPath(path: string): SettingsSection | null {
  return SETTINGS_SECTIONS.find((section) => matchPath(section.to, path)) ?? null;
}
