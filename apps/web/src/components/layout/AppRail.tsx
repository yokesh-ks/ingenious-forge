import { APP_SECTIONS, sectionForPath } from "@/components/layout/app-sections";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import logoUrl from "/logo.svg";

/** The far-left global navigation: one icon and label per app section. */
export default function AppRail({ path }: { path: string }) {
  const active = sectionForPath(path);

  return (
    <nav
      aria-label="Sections"
      className="flex w-15 shrink-0 flex-col overflow-y-auto px-1 py-4 space-y-5 bg-iron"
    >
      <div className="flex items-center justify-center w-full gap-3">
        <img src={logoUrl} alt="Ingenious Clan" className="flex-none" width={28} height={28} />
      </div>
      {APP_SECTIONS.filter((section) => !section.comingSoon).map((section) => {
        const isActive = section.id === active?.id;
        const Icon = section.icon;
        return (
          <Link
            key={section.id}
            to={section.to}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group/rail flex flex-col items-center gap-1 rounded-md text-center text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "font-medium text-on-iron" : "text-on-iron-muted hover:text-on-iron",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-md border border-transparent",
                isActive
                  ? "border-iron-raised bg-iron-raised text-on-iron"
                  : "group-hover/rail:bg-iron-raised",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
