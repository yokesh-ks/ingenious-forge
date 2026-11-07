import { APP_SECTIONS, sectionForPath } from "@/components/layout/app-sections";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

/** The far-left global navigation: one icon and label per app section. */
export default function AppRail({ path }: { path: string }) {
  const active = sectionForPath(path);

  return (
    <nav
      aria-label="Sections"
      className="flex w-15 shrink-0 flex-col gap-2 overflow-y-auto px-1 py-2"
    >
      {APP_SECTIONS.filter((section) => !section.comingSoon).map((section) => {
        const isActive = section.id === active?.id;
        const Icon = section.icon;
        return (
          <Link
            key={section.id}
            to={section.to}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group/rail flex flex-col items-center gap-1 rounded-md py-1 text-center text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-md border border-transparent",
                isActive
                  ? "border-border bg-background shadow-xs"
                  : "group-hover/rail:bg-background/60",
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
