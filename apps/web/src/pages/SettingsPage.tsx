import type { ComponentType } from "react";
import AppearanceSection from "@/features/settings/components/AppearanceSection";
import ArchivedSessionsPage from "@/features/settings/components/ArchivedSessionsPage";
import GitHubSection from "@/features/settings/components/GitHubSection";
import ProviderKeys from "@/features/settings/components/ProviderKeys";
import SessionDefaultsForm from "@/features/settings/components/SessionDefaultsForm";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/features/settings/settings-sections";

const PAGES: Record<SettingsSectionId, ComponentType> = {
  appearance: AppearanceSection,
  archived: ArchivedSessionsPage,
  providers: ProviderKeys,
  defaults: SessionDefaultsForm,
  github: GitHubSection,
};

/** One page of Settings (PRD §6.2 Settings). */
export default function SettingsPage({ section }: { section: SettingsSectionId }) {
  const Page = PAGES[section];
  const title = SETTINGS_SECTIONS.find((s) => s.id === section)?.label;
  return (
    <main
      className={`flex w-full flex-col gap-6 px-4 py-6 ${
        // On a wide screen the Providers list and configuration scroll separately.
        section === "providers" ? "lg:min-h-0 lg:flex-1" : ""
      }`}
    >
      {section !== "providers" && <h2 className="text-xl font-semibold">{title}</h2>}
      <Page />
    </main>
  );
}
