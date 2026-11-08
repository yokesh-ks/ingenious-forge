import { ArrowUpRightIcon, ChevronDownIcon, FolderOpenIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { OpenApp } from "@/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileManagerName } from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * A split button that hands a file, or the project's folder when `path` is
 * absent, to another program. `prominent` is the larger form an unreadable
 * file shows in its place.
 */
export default function OpenTarget({
  projectId,
  path = null,
  prominent = false,
}: {
  projectId: string;
  path?: string | null;
  prominent?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const manager = fileManagerName();
  const isFile = path !== null;
  const primaryApp: OpenApp = isFile ? "vs_code" : "file_manager";

  const open = (app: OpenApp) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    api
      .openProjectIn(projectId, app, path)
      .catch((err: Error) => {
        const reveal = isFile && app === "file_manager";
        toast.error(
          reveal ? "Could not show the file location. Try again." : "Could not open. Try again.",
          {
            description: err.message,
          },
        );
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  };

  const primaryLabel = isFile ? "Open in VS Code" : `Open in ${manager}`;
  const size = prominent ? "size-[18px]" : "size-[13px]";

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        className={cn(
          "inline-flex flex-none items-stretch self-center overflow-hidden border-[0.5px] border-border",
          prominent ? "h-9 rounded-lg" : "h-6 rounded",
        )}
      >
        <button
          type="button"
          disabled={busy}
          title={primaryLabel}
          aria-label={prominent ? undefined : primaryLabel}
          onClick={() => open(primaryApp)}
          className={cn(
            "inline-flex items-center justify-center hover:bg-muted disabled:cursor-default",
            prominent ? "gap-1.5 px-3.5 py-1.5 text-sm" : "gap-1 px-[5px] py-[3px] text-[11px]",
          )}
        >
          <ArrowUpRightIcon aria-hidden className={size} />
          {prominent && "Open"}
        </button>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label="More ways to open"
            className={cn(
              "inline-flex items-center justify-center border-l-[0.5px] border-border text-muted-foreground hover:bg-muted disabled:cursor-default",
              prominent ? "px-2.5 py-1.5" : "py-[3px] pr-1 pl-[3px]",
            )}
          >
            <ChevronDownIcon aria-hidden className={prominent ? "size-3.5" : "size-2.5"} />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end" className="min-w-[180px] [&_[role=menuitem]]:py-[5px]">
        {isFile ? (
          <>
            <DropdownMenuItem onSelect={() => open("vs_code")}>VS Code (default)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("default_app")}>
              Default application
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => open("file_manager")}>
              <FolderOpenIcon aria-hidden />
              Show file location
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => open("file_manager")}>
              {manager} (default)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("vs_code")}>VS Code</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("terminal")}>Terminal</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
