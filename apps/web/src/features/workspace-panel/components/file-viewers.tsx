import { CheckIcon, CopyIcon } from "lucide-react";
import {
  Component,
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/api/client";
import {
  IconButton,
  languageOf,
  TokenLine,
  useCopy,
  useHighlight,
} from "@/components/markdown/code-tools";
import Markdown from "@/components/markdown/Markdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseFileLink } from "@/lib/open-file";
import { cn } from "@/lib/utils";
import { useFileBytes } from "../hooks/use-file-bytes";
import { excelFormat } from "../vendor/sheet/format";
import DocumentLoading from "./DocumentLoading";
import FileTypeIcon from "./FileTypeIcon";
import ZoomViewport, { FIT_WIDTH, ZOOM_SURFACE, type ZoomPreference } from "./ZoomViewport";

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

/** Drag to pan an image larger than its pane. */
function useImagePan(image: HTMLImageElement | null) {
  useEffect(() => {
    const port = image?.closest<HTMLElement>("[data-document-zoom-scrollport]");
    if (!image || !port) return;
    let pointer: { id: number; x: number; y: number; pan: boolean } | undefined;
    const overflowing = () =>
      port.scrollWidth > port.clientWidth || port.scrollHeight > port.clientHeight;
    const measure = () => {
      if (pointer) return;
      image.dataset.pan = overflowing() ? "available" : "none";
    };
    const finish = () => {
      const previous = pointer;
      pointer = undefined;
      if (previous && image.hasPointerCapture(previous.id))
        image.releasePointerCapture(previous.id);
      measure();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      measure();
      const pan = overflowing();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan };
      if (!pan) return;
      event.preventDefault();
      image.dataset.pan = "active";
      image.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointer?.pan || event.pointerId !== pointer.id) return;
      if (event.buttons !== 1) {
        finish();
        return;
      }
      event.preventDefault();
      port.scrollLeft += pointer.x - event.clientX;
      port.scrollTop += pointer.y - event.clientY;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointer?.id) finish();
    };
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(image);
    observer?.observe(port);
    image.addEventListener("load", measure);
    image.addEventListener("pointerenter", measure);
    image.addEventListener("pointerdown", down);
    image.addEventListener("pointermove", move);
    image.addEventListener("pointerup", up);
    image.addEventListener("pointercancel", up);
    image.addEventListener("lostpointercapture", finish);
    window.addEventListener("pointerup", up);
    window.addEventListener("blur", finish);
    measure();
    return () => {
      observer?.disconnect();
      image.removeEventListener("load", measure);
      image.removeEventListener("pointerenter", measure);
      image.removeEventListener("pointerdown", down);
      image.removeEventListener("pointermove", move);
      image.removeEventListener("pointerup", up);
      image.removeEventListener("pointercancel", up);
      image.removeEventListener("lostpointercapture", finish);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [image]);
}

/** An image at its own size or fitted to the pane. */
export function ImageViewer({ src, name }: { src: string; name: string }) {
  const [preference, setPreference] = useState<ZoomPreference>(FIT_WIDTH);
  const [width, setWidth] = useState<number>();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useImagePan(image);
  return (
    <ZoomViewport
      preference={preference}
      intrinsicWidth={width}
      horizontalInset={24}
      onPreference={setPreference}
    >
      <div data-image-preview="" className="box-border flex h-max min-h-full w-full min-w-full p-3">
        {state === "loading" && (
          <output className="m-auto text-[13px] text-muted-foreground">
            Rendering document...
          </output>
        )}
        {state === "failed" && (
          <p role="alert" className="m-auto p-2.5 text-[13px] text-muted-foreground">
            This image could not be displayed.
          </p>
        )}
        <div
          data-document-zoom-surface=""
          hidden={state !== "ready"}
          style={{ "--document-zoom-width": `${width ?? 0}px` } as CSSProperties}
          className={cn("m-auto block flex-none", ZOOM_SURFACE)}
        >
          <img
            ref={setImage}
            src={src}
            alt={`Preview of ${name}`}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              setWidth(event.currentTarget.naturalWidth);
              setState("ready");
            }}
            onError={() => setState("failed")}
            className="block h-auto w-full max-w-none rounded-lg select-none data-[pan=active]:cursor-grabbing data-[pan=available]:cursor-grab"
          />
        </div>
      </div>
    </ZoomViewport>
  );
}

const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ASSETS = 64;
const RELATIVE = /^(?:[a-z][a-z\d+.-]*:|[/\\#?])/iu;

const bytesOf = (text: string) => new TextEncoder().encode(text).byteLength;

const encodeText = (text: string) =>
  btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));

interface HtmlAsset {
  kind: "script" | "stylesheet";
  reference: string;
  text: string;
}

/** Reads the page's relative scripts and stylesheets; the frame has no way
 * to reach them itself. */
export async function packHtml(
  content: string,
  read: (reference: string) => Promise<string>,
): Promise<HtmlAsset[]> {
  let total = bytesOf(content);
  if (total > MAX_TOTAL_BYTES) throw new Error("HTML package exceeds its total byte limit");
  const template = document.createElement("template");
  template.innerHTML = content;
  if (template.content.querySelector("base[href]")) return [];
  const assets: HtmlAsset[] = [];
  const seen = new Set<string>();
  for (const element of template.content.querySelectorAll("script[src],link[href]")) {
    const script = element.localName === "script";
    const type = element.getAttribute("type")?.trim().toLowerCase() ?? "";
    if (script && !["", "text/javascript", "application/javascript"].includes(type)) continue;
    const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/u);
    if (!script && !rel.includes("stylesheet")) continue;
    const reference = element.getAttribute(script ? "src" : "href") as string;
    const suffix = reference.search(/[?#]/u);
    const path = suffix === -1 ? reference : reference.slice(0, suffix);
    if (!reference || RELATIVE.test(reference) || reference.includes("\0")) continue;
    if (!(script ? /\.js$/iu : /\.css$/iu).test(path)) continue;
    const kind = script ? "script" : "stylesheet";
    const key = `${kind}:${reference}`;
    if (seen.has(key)) continue;
    if (assets.length >= MAX_ASSETS) throw new Error("HTML package exceeds its asset count limit");
    const text = await read(reference);
    const size = bytesOf(text);
    if (size > MAX_ASSET_BYTES) throw new Error("HTML asset exceeds its byte limit");
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error("HTML package exceeds its total byte limit");
    assets.push({ kind, reference, text });
    seen.add(key);
  }
  return assets;
}

/** A page that rebuilds `content` inside the sandboxed frame, with its
 * relative scripts and stylesheets swapped for local copies. */
export function htmlDocument(content: string, assets: HtmlAsset[]): string {
  const payload = encodeText(JSON.stringify({ html: content, assets }));
  return `<!doctype html><meta charset="utf-8"><script>(()=>{
const bytes=data=>Uint8Array.from(atob(data),character=>character.charCodeAt(0));
const bundle=JSON.parse(new TextDecoder().decode(bytes("${payload}")));
let html=bundle.html;
if(bundle.assets.length){
  const parsed=new DOMParser().parseFromString(html,'text/html');
  for(const asset of bundle.assets){
    const script=asset.kind==='script';
    const url=URL.createObjectURL(new Blob([asset.text],{type:script?'application/javascript':'text/css'}));
    const attribute=script?'src':'href';
    for(const element of parsed.querySelectorAll(script?'script[src]':'link[rel~="stylesheet" i][href]')){
      if(element.getAttribute(attribute)===asset.reference)element.setAttribute(attribute,url);
    }
  }
  html='<!doctype html>'+parsed.documentElement.outerHTML;
}
document.open();document.write(html);document.close();
})()</script>`;
}

/** A page running in a sandbox with no access to Forge. */
export function HtmlViewer({
  projectId,
  path,
  content,
  name,
}: {
  projectId: string;
  path: string;
  content: string;
  name: string;
}) {
  const [frame, setFrame] = useState<{ content: string; url: string | null }>();
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    const slash = path.lastIndexOf("/");
    const base = slash === -1 ? "" : path.slice(0, slash + 1);
    const read = async (reference: string) => {
      const suffix = reference.search(/[?#]/u);
      const relative = decodeURIComponent(suffix === -1 ? reference : reference.slice(0, suffix));
      const target = parseFileLink(relative, base.replace(/\/$/, ""));
      if (!target) throw new Error("HTML dependency must use a relative file path");
      return (await api.projectFile(projectId, target.path)).content;
    };
    packHtml(content, read).then(
      (assets) => {
        if (!live) return;
        url = URL.createObjectURL(new Blob([htmlDocument(content, assets)], { type: "text/html" }));
        setFrame({ content, url });
      },
      () => live && setFrame({ content, url: null }),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId, path, content]);
  if (frame?.content !== content) {
    return <DocumentLoading />;
  }
  if (frame.url === null) {
    return (
      <p role="alert" className="m-0 p-6 text-center text-[13px] text-muted-foreground">
        This HTML page could not be displayed.
      </p>
    );
  }
  return (
    <iframe
      key={frame.url}
      src={frame.url}
      sandbox="allow-scripts"
      title={`HTML preview: ${name}`}
      data-html-preview=""
      className="block size-full border-0 bg-white"
    />
  );
}

const PdfBody = lazy(() => import("./PdfBody"));
const SheetBody = lazy(() => import("./SheetBody"));

const LOADING = <DocumentLoading />;

/** Keeps a viewer's failure inside its tab. */
class ViewerBoundary extends Component<
  { onRetry: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-muted-foreground"
      >
        <p className="m-0">This file could not be displayed.</p>
        <button
          type="button"
          onClick={this.props.onRetry}
          className="rounded-md border-[0.5px] border-border px-3 py-1.5 text-foreground hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }
}

/** A document read from its bytes: a PDF, a sheet, or Office as a PDF. */
export function BytesViewer({
  viewer,
  url,
  path,
  onFonts,
  onRetry,
}: {
  viewer: "pdf" | "sheet" | "office";
  url: string;
  path: string;
  onFonts: (fonts: string[]) => void;
  onRetry: () => void;
}) {
  const state = useFileBytes(url);
  const file = state.status === "ready" ? state.file : null;
  useEffect(() => {
    if (viewer !== "office" || !file) return;
    const header = file.headers.get("x-missing-fonts");
    onFonts(header ? JSON.parse(decodeURIComponent(header)) : []);
  }, [viewer, file, onFonts]);
  if (state.status === "loading") return LOADING;
  if (state.status === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-[13px] leading-[1.6] text-muted-foreground">
        <FileTypeIcon path={path} className="size-9 opacity-60 grayscale" />
        <p className="m-0">{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border-[0.5px] border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <ViewerBoundary key={url} onRetry={onRetry}>
      <Suspense fallback={LOADING}>
        {viewer === "sheet" ? (
          <SheetBody data={state.file.data} format={excelFormat(path)} />
        ) : (
          <PdfBody data={state.file.data} />
        )}
      </Suspense>
    </ViewerBoundary>
  );
}
