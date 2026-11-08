import { BrainIcon, ChevronDownIcon, ChevronUpIcon, FileInputIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatGroup } from "../model/build-chat";
import ChatRow, { type RowHandlers } from "./ChatRow";
import { CATEGORY_ICONS } from "./category-icons";

/**
 * A run of reasoning and tool calls under one title. In a running turn
 * (`live`) the rows show directly, with no header or height cap. Once the
 * turn is history, finished groups start closed; one still waiting for
 * the user is open.
 */
export default function ProcessGroup({
  group,
  live = false,
  ...handlers
}: { group: ChatGroup; live?: boolean } & RowHandlers) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? (group.running || group.waiting);
  const bodyId = useId();
  // With no tool calls, the reasoning (or context) icon, as its rows use.
  const Icon = group.activity
    ? CATEGORY_ICONS[group.activity]
    : group.items.every((i) => i.role === "context")
      ? FileInputIcon
      : BrainIcon;
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;

  if (live) {
    return (
      <div className="flex flex-col gap-1">
        {group.items.map((item) => (
          <ChatRow key={item.id} item={item} {...handlers} />
        ))}
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-activity={group.activity ?? "analysis"}
        onClick={() => setToggled(!open)}
        className="group/header flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground/80 outline-none hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="relative flex size-3.5 items-center justify-center">
          <Icon
            aria-hidden
            className={cn(
              "size-3.5",
              open ? "hidden" : "group-hover/header:hidden group-focus-visible/header:hidden",
            )}
          />
          <Chevron
            aria-hidden
            className={cn(
              "size-3.5",
              open ? "block" : "hidden group-hover/header:block group-focus-visible/header:block",
            )}
          />
        </span>
        {group.title}
      </button>
      {open && (
        <div
          id={bodyId}
          className="flex max-h-[min(400px,50vh)] flex-col gap-1 overflow-y-auto pl-0.5 [mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-24px),transparent)] py-6 -my-6"
        >
          {group.items.map((item) => (
            <ChatRow key={item.id} item={item} {...handlers} />
          ))}
        </div>
      )}
    </section>
  );
}
