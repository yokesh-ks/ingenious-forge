import { PanelRightIcon, XIcon } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { STRIP_BUTTON } from "./TabStrip";

/** The title row of a floating panel; pressing it moves the panel. */
export function FloatHeader({
  title,
  icon,
  closable,
  onGrip,
  onDock,
  onClose,
}: {
  title: string;
  icon: ReactNode;
  closable: boolean;
  onGrip: (event: PointerEvent) => void;
  onDock: () => void;
  onClose: () => void;
}) {
  const stay = (event: PointerEvent) => event.stopPropagation();
  return (
    <header
      data-float-grip=""
      onPointerDown={onGrip}
      className="flex h-[38px] flex-none cursor-move touch-none items-center gap-1 pt-2.5 pr-1.5 pl-2.5 select-none"
    >
      <div className="flex h-7 max-w-[170px] min-w-[100px] items-center gap-[5px] overflow-hidden px-2.5 text-[13px] whitespace-nowrap text-muted-foreground">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <span className="min-w-0 flex-1" />
      <button
        type="button"
        aria-label="Send back to the sidebar"
        title="Send back to the sidebar"
        className={STRIP_BUTTON}
        onPointerDown={stay}
        onClick={onDock}
      >
        <PanelRightIcon aria-hidden className="size-4" />
      </button>
      {closable && (
        <button
          type="button"
          aria-label="Close"
          title="Close"
          className={STRIP_BUTTON}
          onPointerDown={stay}
          onClick={onClose}
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      )}
    </header>
  );
}

/** The corner that resizes a floating panel; its grip shows on hover. */
export function FloatResizeCorner({ onGrip }: { onGrip: (event: PointerEvent) => void }) {
  return (
    <div
      data-float-resize=""
      onPointerDown={onGrip}
      className="absolute right-0 bottom-0 size-5 cursor-nwse-resize touch-none after:absolute after:right-1 after:bottom-1 after:size-6 after:rounded-br-[24px] after:border-r-[1.5px] after:border-b-[1.5px] after:border-muted-foreground/70 after:opacity-0 after:transition-opacity group-hover/float:after:opacity-100 active:after:opacity-100"
    />
  );
}
