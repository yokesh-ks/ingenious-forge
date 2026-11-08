import { CheckIcon, CopyIcon } from "lucide-react";
import type { Usage } from "@/api/types";
import { useCopy } from "@/components/markdown/code-tools";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClock, formatTokens, totalTokens } from "../model/format";

/**
 * The line under a turn's last reply: Copy, the tokens the turn used (with
 * each bucket on hover) and when it finished.
 */
export default function ReplyFooter({
  text,
  usage,
  at,
}: {
  text: string;
  usage: Usage | null;
  at: number | null;
}) {
  const { copied, copy } = useCopy(text);
  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy reply"}
          onClick={copy}
          className="inline-flex size-6 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
        {usage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="tabular-nums hover:text-foreground">
                Usage {formatTokens(totalTokens(usage))} tok
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <dl className="grid grid-cols-[auto_auto] gap-x-3 tabular-nums">
                <dt>Input</dt>
                <dd>{formatTokens(usage.input)}</dd>
                <dt>Output</dt>
                <dd>{formatTokens(usage.output)}</dd>
                <dt>Cache read</dt>
                <dd>{formatTokens(usage.cache_read)}</dd>
                <dt>Cache write</dt>
                <dd>{formatTokens(usage.cache_write)}</dd>
              </dl>
            </TooltipContent>
          </Tooltip>
        )}
        {at !== null && <span className="tabular-nums">{formatClock(at)}</span>}
      </div>
    </TooltipProvider>
  );
}
