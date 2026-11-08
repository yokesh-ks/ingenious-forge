import { CheckIcon, CopyIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { columnName, parseDelimited } from "../model/delimited";

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

const ZOOMS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

/** An image at its own size, or shrunk to fit; drag to pan a large one. */
export function ImageViewer({ src, name }: { src: string; name: string }) {
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [natural, setNatural] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const port = useRef<HTMLDivElement>(null);

  if (failed) {
    return (
      <p role="alert" className="m-0 p-6 text-center text-[13px] text-muted-foreground">
        This image could not be displayed.
      </p>
    );
  }

  const room = port.current?.clientWidth;
  const fitted = natural && room ? Math.min(1, room / natural) : 1;
  const percent = zoom === "fit" ? Math.round(fitted * 100) : zoom;
  const stepped = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? ZOOMS.find((value) => value > percent)
        : [...ZOOMS].reverse().find((value) => value < percent);
    if (next) setZoom(next);
  };

  return (
    <div className="group/zoom relative h-full min-h-0 w-full min-w-0">
      <div
        ref={port}
        data-scrollport=""
        onPointerDown={(event) => {
          const element = port.current;
          if (event.button !== 0 || !element) return;
          const start = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          };
          const onMove = (e: PointerEvent) => {
            element.scrollLeft = start.left - (e.clientX - start.x);
            element.scrollTop = start.top - (e.clientY - start.y);
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        className="flex h-full min-h-0 w-full overflow-auto"
      >
        <img
          src={src}
          alt={`Preview of ${name}`}
          draggable={false}
          onLoad={(event) => setNatural(event.currentTarget.naturalWidth)}
          onError={() => setFailed(true)}
          style={
            zoom === "fit" || !natural
              ? { maxWidth: "100%" }
              : { width: natural * (zoom / 100), maxWidth: "none" }
          }
          className="m-auto block h-auto flex-none"
        />
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-popover p-0.5 opacity-0 shadow-lg ring-[0.5px] ring-border transition-opacity group-focus-within/zoom:opacity-100 group-hover/zoom:opacity-100">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => stepped(-1)}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <MinusIcon aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Fit width"
          title="Fit width"
          onClick={() => setZoom("fit")}
          className="h-7 min-w-12 rounded px-1 text-xs text-muted-foreground tabular-nums hover:bg-muted"
        >
          {percent}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => stepped(1)}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <PlusIcon aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** A PDF in the browser's own viewer. */
export function PdfViewer({ src, name }: { src: string; name: string }) {
  return <iframe src={src} title={`PDF preview: ${name}`} className="block size-full border-0" />;
}

/** No scripts, network, forms or nested frames: the page only draws itself. */
const HTML_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:";

/** Prepends the policy, so the browser applies it before reading anything else. */
export const staticHtml = (content: string) =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="${HTML_POLICY}">${content.replace(/^\s*<!doctype[^>]*>/i, "")}`;

export function HtmlViewer({ content, name }: { content: string; name: string }) {
  return (
    <iframe
      sandbox=""
      srcDoc={staticHtml(content)}
      title={`HTML preview: ${name}`}
      className="block size-full border-0 bg-white"
    />
  );
}

/** CSV or TSV as a read-only grid; every field stays literal text. */
export function TableViewer({ path, content }: { path: string; content: string }) {
  const separator = path.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const { rows, columns, truncated } = useMemo(
    () => parseDelimited(content, separator),
    [content, separator],
  );
  const headers = Array.from({ length: columns }, (_, index) => columnName(index));
  const CELL = "border-r border-b border-border px-1.5 py-0.5 whitespace-pre";
  const HEAD = "bg-muted text-center font-normal text-muted-foreground";
  return (
    <div data-scrollport="" className="h-full min-h-0 w-full min-w-0 overflow-auto text-xs">
      <table className="border-separate border-spacing-0">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className={cn(CELL, HEAD, "sticky left-0 z-[2] min-w-10")} aria-label="Row" />
            {headers.map((header) => (
              <th key={header} className={cn(CELL, HEAD, "min-w-20")}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the row's identity
            <tr key={r}>
              <th className={cn(CELL, HEAD, "sticky left-0")}>{r + 1}</th>
              {headers.map((header, c) => (
                <td key={header} className={CELL}>
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="m-0 p-2 text-muted-foreground">Too many cells, showing only some of them.</p>
      )}
    </div>
  );
}
