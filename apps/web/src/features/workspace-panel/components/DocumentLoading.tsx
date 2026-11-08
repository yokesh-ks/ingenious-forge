import { Loader2Icon } from "lucide-react";

/** What a document shows while it is read or drawn. */
export default function DocumentLoading() {
  return (
    <output className="flex h-full w-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
      <Loader2Icon aria-hidden className="size-7 animate-spin" />
      <span>Rendering document...</span>
    </output>
  );
}
