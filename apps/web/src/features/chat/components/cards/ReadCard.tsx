import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import { useState } from "react";
import {
  IconButton,
  languageOf,
  TokenLine,
  useCopy,
  useHighlight,
} from "@/components/markdown/code-tools";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ToolItem } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";
import { baseName, CARD, field } from "./card-shell";

/** Files longer than this show their first and last few lines. */
const MAX_LINES = 8;
const EDGE = MAX_LINES / 2;

interface Line {
  number: number;
  text: string;
}

/** A read's lines from its result details; older sessions only have the
 * result text, possibly wrapped in `<content>` with numbered lines. */
function readLines(tool: ToolItem): Line[] {
  const meta = tool.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta) && Array.isArray(meta.lines)) {
    return meta.lines.flatMap((line) =>
      line &&
      typeof line === "object" &&
      !Array.isArray(line) &&
      typeof line.number === "number" &&
      typeof line.text === "string"
        ? [{ number: line.number, text: line.text }]
        : [],
    );
  }
  const output = tool.output ?? "";
  const content = /<content>\n([\s\S]*?)\n?<\/content>/.exec(output);
  if (content) {
    return content[1].split("\n").flatMap((raw) => {
      const match = /^(\d+): ?(.*)$/.exec(raw);
      return match ? [{ number: Number(match[1]), text: match[2] }] : [];
    });
  }
  return output.split("\n").map((text, i) => ({ number: i + 1, text }));
}

/**
 * A file a read returned: language and name in the header with Wrap and
 * Copy, then numbered, highlighted lines. A long file shows its first and
 * last four lines around a button that shows the rest in place.
 */
export default function ReadCard({ tool }: { tool: ToolItem }) {
  const lines = readLines(tool);
  const path =
    field(tool.meta ?? undefined, "path") ??
    field(tool.args, "file_path") ??
    field(tool.args, "path") ??
    "";
  const name = baseName(path);
  const { badge, lang } = languageOf(path);
  const text = lines.map((l) => l.text).join("\n");
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { copied, copy } = useCopy(text);
  const tokens = useHighlight(text, lang);

  const hidden = expanded || lines.length <= MAX_LINES ? 0 : lines.length - MAX_LINES;
  const width = `${String(lines[lines.length - 1]?.number ?? 1).length}ch`;
  const row = (line: Line, index: number) => (
    <div key={line.number} data-testid="read-line" className="flex gap-3">
      <span className="shrink-0 select-none text-right text-muted-foreground" style={{ width }}>
        {line.number}
      </span>
      <span className={cn("min-w-0", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>
        {tokens?.[index] ? <TokenLine tokens={tokens[index]} /> : line.text}
      </span>
    </div>
  );

  return (
    <TooltipProvider>
      <figure aria-label={name} className={CARD}>
        <figcaption className="flex items-center justify-between gap-2 pt-2.5 pr-4 pb-2 pl-5 text-[11px] leading-[18px] text-muted-foreground">
          <span className="flex min-w-0 items-baseline gap-2">
            {badge && <span className="font-mono">{badge}</span>}
            <span className="truncate">{name}</span>
          </span>
          <span className="flex items-center gap-1">
            <IconButton
              label="Wrap lines"
              tooltip={wrap ? "Don't wrap lines" : "Wrap lines"}
              pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              <WrapTextIcon />
            </IconButton>
            <IconButton label={copied ? "Copied" : "Copy"} tooltip="Copy" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </span>
        </figcaption>
        <div className="overflow-x-auto px-5 pt-1.5 pb-5 font-mono text-[11px] leading-[19px]">
          {hidden === 0 ? (
            lines.map(row)
          ) : (
            <>
              {lines.slice(0, EDGE).map(row)}
              <button
                type="button"
                aria-label={`Expand ${hidden} more lines`}
                onClick={() => setExpanded(true)}
                className="block w-full text-left text-muted-foreground hover:text-foreground"
                style={{ paddingLeft: `calc(${width} + 0.75rem)` }}
              >
                … {hidden} more lines
              </button>
              {lines.slice(-EDGE).map((line, i) => row(line, lines.length - EDGE + i))}
            </>
          )}
        </div>
      </figure>
    </TooltipProvider>
  );
}
