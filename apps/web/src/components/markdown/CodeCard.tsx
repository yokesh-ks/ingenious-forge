import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type HighlightToken, highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface CodeCardProps {
  code: string;
  /** The fence's language as written, or empty. */
  lang: string;
  /** Code fences start wrapped; source previews keep their columns. */
  defaultWrap?: boolean;
}

function IconButton({
  label,
  tooltip,
  pressed,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A code card: language (or "Code block") in the header with wrap and copy
 * controls, and the code below, highlighted when Shiki knows the language.
 */
export default function CodeCard({ code, lang, defaultWrap = true }: CodeCardProps) {
  const [wrap, setWrap] = useState(defaultWrap);
  const [copied, setCopied] = useState(false);
  const [tokens, setTokens] = useState<HighlightToken[][] | null>(null);
  const title = lang || "Code block";

  useEffect(() => {
    let live = true;
    setTokens(null);
    if (lang) {
      void highlight(code, lang).then((result) => {
        if (live) setTokens(result);
      });
    }
    return () => {
      live = false;
    };
  }, [code, lang]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => setCopied(true));
  };

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
                    {line.map((token, at) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: position is the token's identity
                      <span key={at} data-token="" className="shiki-token" style={token.style}>
                        {token.content}
                      </span>
                    ))}
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
