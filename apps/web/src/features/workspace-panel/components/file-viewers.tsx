import { CheckIcon, CopyIcon } from "lucide-react";
import { useMemo } from "react";
import {
  IconButton,
  languageOf,
  TokenLine,
  useCopy,
  useHighlight,
} from "@/components/markdown/code-tools";
import Markdown from "@/components/markdown/Markdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Beyond this the file shows without syntax colours, to stay responsive. */
const MAX_HIGHLIGHTED = 200_000;

function linesOf(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The band on a line opened by a link; it fades and removes itself. */
const LINE_MARK = "data-[line-mark]:animate-[line-mark-fade_2s_ease-in_forwards]";

export function CodeViewer({
  path,
  content,
  wrap,
}: {
  path: string;
  content: string;
  wrap: boolean;
}) {
  const { lang } = languageOf(path);
  const { copied, copy } = useCopy(content);
  const tokens = useHighlight(content.length > MAX_HIGHLIGHTED ? "" : content, lang);
  const lines = useMemo(() => linesOf(content), [content]);
  const digits = String(lines.length).length;

  return (
    <div data-code-preview="" className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex h-[42px] flex-none items-center justify-between pr-[18px] pl-[22px]">
        <span className="truncate font-mono text-[11px] leading-[18px] text-muted-foreground">
          {lang}
        </span>
        <TooltipProvider>
          <IconButton label={copied ? "Copied" : "Copy"} tooltip="Copy" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </TooltipProvider>
      </div>
      <div data-scrollport="" className="relative min-h-0 min-w-0 flex-[1_1_auto] overflow-auto">
        <pre
          className={cn(
            "box-border min-w-full p-4 font-mono text-[11px] leading-[19px]",
            wrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "w-max whitespace-pre",
          )}
        >
          <code>
            {lines.map((line, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: position is the line's identity
                key={index}
                data-line={index + 1}
                className={cn("flex", LINE_MARK)}
              >
                <span
                  aria-hidden
                  style={{ width: `${digits}ch` }}
                  className="mr-3 flex-none text-right text-muted-foreground/70 select-none"
                >
                  {index + 1}
                </span>
                <span className="min-h-[19px] min-w-0 flex-1">
                  {tokens?.[index] ? <TokenLine tokens={tokens[index]} /> : line}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

export function TextViewer({ content, wrap }: { content: string; wrap: boolean }) {
  const lines = useMemo(() => linesOf(content), [content]);
  return (
    <div
      data-scrollport=""
      className="relative h-full min-h-0 w-full min-w-0 overflow-auto font-mono text-[11px] leading-[19px]"
    >
      <div className={cn("box-border min-h-full min-w-full p-2", !wrap && "w-max")}>
        <pre
          className={cn(
            "m-0",
            wrap ? "whitespace-pre-wrap [word-break:break-word]" : "whitespace-pre",
          )}
        >
          {lines.map((line, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: position is the line's identity
              key={index}
              data-line={index + 1}
              className={cn("min-h-[19px] px-2.5", LINE_MARK)}
            >
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export function MarkdownViewer({ path, content }: { path: string; content: string }) {
  const slash = path.lastIndexOf("/");
  return (
    <div data-scrollport="" className="h-full min-h-0 w-full min-w-0 overflow-auto">
      <Markdown
        text={content}
        baseDir={slash === -1 ? "" : path.slice(0, slash)}
        className="markdown-document px-3 py-2.5 [&_a]:font-medium [&_a]:no-underline!"
      />
    </div>
  );
}
