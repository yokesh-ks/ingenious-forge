import { BrainIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { ApprovalDecision, QuestionAnswer } from "@/api/types";
import Markdown from "@/components/markdown/Markdown";
import ToolCallCard from "@/features/session/components/ToolCallCard";
import type { ReasoningItem, ToolItem } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";
import { category, rowDetail, toolDisplayName } from "../model/build-chat";
import { CATEGORY_ICONS } from "./category-icons";

export interface RowHandlers {
  /** Opens a file a row links to. */
  onOpenFile?: (path: string) => void;
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
}

/** The first non-empty line of a reasoning block. */
function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

/**
 * One reasoning block or tool call in a process group: `[icon] Name ·
 * detail` on one line, opening to its full body. A row whose card waits
 * for the user starts open.
 */
export default function ChatRow({
  item,
  onOpenFile,
  onAnswerApproval,
  onAnswerQuestion,
}: { item: ToolItem | ReasoningItem } & RowHandlers) {
  const waiting =
    item.role === "tool" &&
    (item.approval?.status === "pending" || item.question?.status === "pending");
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? waiting;
  const toggle = () => setToggled(!open);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed on the file link inside belong to the link.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  const isTool = item.role === "tool";
  const Icon = isTool ? CATEGORY_ICONS[category(item.name)] : BrainIcon;
  const name = isTool ? toolDisplayName(item.name) : "Think";
  const detail = isTool ? rowDetail(item.args) : { text: firstLine(item.text), path: null };
  const failed = isTool && item.status === "error";
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;

  return (
    <div data-variant={isTool ? item.name : "think"} data-state={failed ? "error" : "ok"}>
      {/* biome-ignore lint/a11y/useSemanticElements: the row holds a file link, and a button cannot contain one */}
      <div
        role="button"
        tabIndex={0}
        aria-label={detail.text ? `${name} · ${detail.text}` : name}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="group/row flex min-w-0 cursor-pointer items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          <Icon
            aria-hidden
            className={cn(
              "size-3.5",
              open ? "hidden" : "group-hover/row:hidden group-focus-visible/row:hidden",
            )}
          />
          <Chevron
            aria-hidden
            className={cn(
              "size-3.5",
              open ? "block" : "hidden group-hover/row:block group-focus-visible/row:block",
            )}
          />
        </span>
        <span className="shrink-0 font-medium">{name}</span>
        {detail.text && (
          <span className="min-w-0 truncate">
            {"· "}
            {detail.path && !failed ? (
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  if (detail.path) onOpenFile?.(detail.path);
                }}
              >
                {detail.text}
              </button>
            ) : (
              detail.text
            )}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-1 ml-5">
          {isTool ? (
            <ToolCallCard
              tool={item}
              onAnswer={onAnswerApproval}
              onAnswerQuestion={onAnswerQuestion}
            />
          ) : (
            <div className="text-[13px] leading-5 text-muted-foreground">
              <Markdown text={item.text} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
