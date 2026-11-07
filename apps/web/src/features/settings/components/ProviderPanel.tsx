import { ArrowLeftIcon, XIcon } from "lucide-react";
import { type RefObject, useEffect } from "react";
import { Button } from "@/components/ui/button";

/** The layout shared by the provider configuration pages: sections split by
 * dividers, with the actions at the very end. */
export const PANEL = "flex flex-col @container";
export const PANEL_BODY = "flex flex-col divide-y";
export const PANEL_SECTION = "flex flex-col gap-4 py-6";
export const PANEL_FOOTER = "flex justify-end gap-2 border-t pt-6";

export function PanelHeader({
  id,
  title,
  description,
  onBack,
}: {
  id: string;
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <header className="flex flex-col items-start gap-3 border-b pb-6">
      {/* Narrow screens show this page in place of the list, so they need a way back. */}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="-ml-2 @2xl/providers:hidden"
        onClick={onBack}
      >
        <ArrowLeftIcon /> Back to providers
      </Button>
      <div className="flex w-full items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={id} className="text-lg font-semibold">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close"
          className="hidden @2xl/providers:inline-flex"
          onClick={onBack}
        >
          <XIcon />
        </Button>
      </div>
    </header>
  );
}

/** Starts a newly opened page at the top, with its first field ready to type in. */
export function useFocusOnOpen(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.querySelector("input")?.focus({ preventScroll: true });
  }, [ref]);
}
