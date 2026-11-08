import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IconButton, TokenLine, useCopy, useHighlight } from "./code-tools";

interface CodeCardProps {
  code: string;
  /** The fence's language as written, or empty. */
  lang: string;
  /** Code fences start wrapped; source previews keep their columns. */
  defaultWrap?: boolean;
}

/**
 * A code card: language (or "Code block") in the header with wrap and copy
 * controls, and the code below, highlighted when Shiki knows the language.
 */
export default function CodeCard({ code, lang, defaultWrap = true }: CodeCardProps) {
  const [wrap, setWrap] = useState(defaultWrap);
  const { copied, copy } = useCopy(code);
  const tokens = useHighlight(code, lang);
  const title = lang || "Code block";

  return (
    <TooltipProvider>
      <figure
        aria-label={title}
        className="my-3 overflow-hidden rounded-lg bg-muted/60 text-[13px] leading-5"
      >
        <figcaption className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <span className="truncate font-mono text-xs text-muted-foreground">{title}</span>
          <span className="flex items-center gap-1">
            <IconButton
              label="Wrap lines"
              tooltip={wrap ? "Don't wrap lines" : "Wrap lines"}
              pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              <WrapTextIcon />
            </IconButton>
            <IconButton
              label={copied ? "Copied" : "Copy"}
              tooltip={copied ? "Copied" : "Copy"}
              onClick={copy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </span>
        </figcaption>
        <pre
          className={cn(
            "overflow-x-auto px-3 pt-1 pb-3 font-mono",
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          )}
        >
          <code>
            {tokens
              ? tokens.map((line, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: position is the line's identity
                  <span key={index}>
                    <TokenLine tokens={line} />
                    {index < tokens.length - 1 ? "\n" : null}
                  </span>
                ))
              : code}
          </code>
        </pre>
      </figure>
    </TooltipProvider>
  );
}
