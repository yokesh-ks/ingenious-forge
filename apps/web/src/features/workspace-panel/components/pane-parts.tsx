import { type ComponentProps, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** A path on one line: the folders subdued, the name plain. When it does
 * not fit, the end stays visible and the start fades out. */
export function PathLabel({ path }: { path: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const slash = path.lastIndexOf("/") + 1;

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = text.current;
    if (!outer || !inner) return;
    const measure = () => setClipped(inner.offsetWidth > outer.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={box}
      title={path}
      className={cn(
        "mr-3 flex min-w-0 flex-[1_1_auto] justify-end overflow-hidden text-xs whitespace-nowrap",
        clipped && "[mask-image:linear-gradient(to_right,transparent,black_28px)]",
      )}
    >
      <span ref={text} className="mr-auto flex-none">
        <span className="text-muted-foreground">{path.slice(0, slash)}</span>
        <span className="text-foreground">{path.slice(slash)}</span>
      </span>
    </span>
  );
}

/** The 38px row under the tab strip: a path and its controls. */
export function PaneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[38px] flex-none items-center gap-1 border-b border-border/70 pr-1.5 pl-4">
      {children}
    </div>
  );
}

/** An icon button in a pane header. */
export function ToolButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground [&_svg]:size-[15px]",
        className,
      )}
      {...props}
    />
  );
}
