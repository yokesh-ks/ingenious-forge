import "pdfjs-dist";
import { getDocument, type PDFDocumentProxy, type PDFPageProxy, PDFWorker } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer.mjs";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import DocumentLoading from "./DocumentLoading";
import ZoomViewport, { FIT_WIDTH, ZOOM_SURFACE, type ZoomPreference } from "./ZoomViewport";

/** Fonts and character maps a PDF may ask for, fetched only when it does. */
const ASSETS = import.meta.glob("/node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/*", {
  query: "?url",
  import: "default",
}) as Record<string, () => Promise<string>>;

const ASSET_DIRS: Record<string, string> = {
  cMapUrl: "cmaps",
  standardFontDataUrl: "standard_fonts",
  wasmUrl: "wasm",
};

class BundledAssets {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const load = ASSETS[`/node_modules/pdfjs-dist/${ASSET_DIRS[kind]}/${filename}`];
    if (!load) throw new Error(`PDF asset is not bundled: ${kind}/${filename}`);
    const response = await fetch(await load());
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** PDF.js's 96 dpi display size, as the page's natural width. */
const DISPLAY_SCALE = 96 / 72;
/** Keeps very large pages from allocating an enormous canvas. */
const MAX_CANVAS_AREA = 16_777_216;

function failureText(error: unknown): string {
  if (error instanceof Error && error.name === "PasswordException") {
    return "This PDF requires a password; password-protected previews are not supported.";
  }
  return `Cannot display PDF: ${error instanceof Error ? error.message : String(error)}`;
}

const STATUS = "flex items-center gap-2 p-2.5 text-[13px] leading-normal text-muted-foreground";
const RETRY = "rounded-md border-[0.5px] border-border px-2.5 py-1 text-xs hover:bg-muted";

/** Puts a page's selectable text over its image. */
function renderText(
  host: HTMLDivElement,
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
) {
  let cancelled = false;
  const layer = new TextLayerBuilder({
    pdfPage: page,
    onAppend: () => {
      if (cancelled) layer.cancel();
      else host.append(container);
    },
  });
  const container = layer.div;
  container.style.setProperty("--total-scale-factor", String(viewport.scale * viewport.userUnit));
  container.style.setProperty("--scale-round-x", "1px");
  container.style.setProperty("--scale-round-y", "1px");
  const resize = () => {
    container.style.scale = String(host.getBoundingClientRect().width / viewport.width);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return {
    promise: layer.render({ viewport } as Parameters<TextLayerBuilder["render"]>[0]),
    cancel() {
      cancelled = true;
      observer.disconnect();
      layer.cancel();
      container.remove();
    },
  };
}

type TextTask = ReturnType<typeof renderText>;

function PdfPage({
  document: pdf,
  page,
  first,
  zoom,
  onWidth,
}: {
  document: PDFDocumentProxy;
  page: number;
  first: boolean;
  zoom: number;
  onWidth?: (width: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [requested, setRequested] = useState(first);
  const [visible, setVisible] = useState(first);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown }>();
  const [attempt, setAttempt] = useState(0);
  const drawnZoom = useRef<number | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const text = useRef<TextTask | undefined>(undefined);

  useEffect(() => {
    const node = ready ? canvas.current : host.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setRequested(true);
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.some((entry) => entry.isIntersecting);
        setVisible(seen);
        if (seen) setRequested(true);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => () => text.current?.cancel(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt asks for another try
  useEffect(() => {
    if (!requested) return;
    setFailure(undefined);
    if (drawnZoom.current !== undefined && (!visible || drawnZoom.current === zoom)) return;
    const node = canvas.current;
    if (!node) return;
    let stopped = false;
    let cancelTask = () => {};
    let newText: TextTask | undefined;
    // A cancelled render must finish cleaning up before the next one starts.
    queue.current = queue.current
      .then(async () => {
        if (stopped) return;
        const buffer = node.ownerDocument.createElement("canvas");
        const proxy = await pdf.getPage(page);
        try {
          if (stopped) return;
          const viewport = proxy.getViewport({ scale: DISPLAY_SCALE });
          const ratio = Math.min(
            window.devicePixelRatio * zoom,
            Math.sqrt(MAX_CANVAS_AREA / (viewport.width * viewport.height)),
          );
          buffer.width = Math.max(1, Math.floor(viewport.width * ratio));
          buffer.height = Math.max(1, Math.floor(viewport.height * ratio));
          const task = proxy.render({
            canvas: buffer,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          });
          cancelTask = () => task.cancel();
          if (!text.current && textHost.current)
            newText = renderText(textHost.current, proxy, viewport);
          await Promise.all([task.promise, newText?.promise]);
          if (stopped) return;
          const context = node.getContext("2d");
          if (!context) throw new Error("PDF canvas has no 2D context");
          node.width = buffer.width;
          node.height = buffer.height;
          context.drawImage(buffer, 0, 0);
          text.current ??= newText;
          newText = undefined;
          drawnZoom.current = zoom;
          setWidth(viewport.width);
          onWidth?.(viewport.width);
          setReady(true);
        } finally {
          proxy.cleanup();
          buffer.width = 0;
          buffer.height = 0;
          newText?.cancel();
        }
      })
      .catch((error: unknown) => {
        if (!stopped && (error as Error)?.name !== "RenderingCancelledException") {
          setFailure({ error });
        }
      });
    return () => {
      stopped = true;
      cancelTask();
      newText?.cancel();
    };
  }, [pdf, page, requested, visible, zoom, attempt, onWidth]);

  return (
    <div ref={host} data-pdf-page={page} className="box-border w-full min-w-0">
      {!failure &&
        !ready &&
        (requested ? (
          <output aria-label="Rendering page…" className="block aspect-[3/4] w-full bg-muted" />
        ) : (
          <div className="aspect-[3/4] w-full bg-muted" />
        ))}
      {failure && (
        <div role="alert" className={STATUS}>
          <span>{failureText(failure.error)}</span>
          <button type="button" className={RETRY} onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      <div
        data-document-zoom-surface=""
        hidden={!ready}
        style={{ "--document-zoom-width": `${width ?? 0}px` } as CSSProperties}
        className={`pdf-surface relative mx-auto shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_3px_8px_rgba(0,0,0,0.04),0_0_20px_rgba(0,0,0,0.05)] ${ZOOM_SURFACE}`}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={`PDF page ${page}`}
          className="mx-auto block h-auto w-full max-w-none"
        />
        <div ref={textHost} data-pdf-text="" className="pdf-text absolute inset-0 overflow-clip" />
      </div>
    </div>
  );
}

type Load =
  | { kind: "loaded"; data: Uint8Array; document: PDFDocumentProxy }
  | { kind: "failed"; data: Uint8Array; error: unknown };

/** Every page of a PDF, drawn as it nears the screen. */
export default function PdfBody({ data }: { data: Uint8Array }) {
  const [load, setLoad] = useState<Load>();
  const [attempt, setAttempt] = useState(0);
  const [pageWidth, setPageWidth] = useState<number>();
  const [renderZoom, setRenderZoom] = useState(1);
  const [preference, setPreference] = useState<ZoomPreference>(FIT_WIDTH);
  const onWidth = useCallback((width: number) => setPageWidth(width), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt asks for another try
  useEffect(() => {
    let live = true;
    setLoad(undefined);
    const port = new Worker(workerUrl, { type: "module", name: "forge-pdf" });
    const worker = PDFWorker.create({ port });
    const options = {
      data: data.slice(),
      worker,
      BinaryDataFactory: BundledAssets,
      cMapPacked: true,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: true,
    };
    const task = getDocument(options as Parameters<typeof getDocument>[0]);
    task.promise.then(
      (document) => live && setLoad({ kind: "loaded", data, document }),
      (error: unknown) => live && setLoad({ kind: "failed", data, error }),
    );
    return () => {
      live = false;
      void task.destroy().finally(() => {
        worker.destroy();
        port.terminate();
      });
    };
  }, [data, attempt]);

  if (load?.data !== data) {
    return <DocumentLoading />;
  }
  if (load.kind === "failed") {
    return (
      <div role="alert" className={STATUS}>
        <span>{failureText(load.error)}</span>
        <button type="button" className={RETRY} onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <ZoomViewport
      preference={preference}
      intrinsicWidth={pageWidth}
      horizontalInset={24}
      onPreference={setPreference}
      onRenderZoom={setRenderZoom}
    >
      <section
        data-pdf-preview=""
        className="box-border flex min-h-full w-full min-w-full flex-col gap-3 bg-[#ebeef2] p-3 dark:bg-muted [[data-document-zoom-mode=fixed]_&]:w-max"
      >
        {Array.from({ length: load.document.numPages }, (_, index) => (
          <PdfPage
            // biome-ignore lint/suspicious/noArrayIndexKey: a page's number is its identity
            key={index}
            document={load.document}
            page={index + 1}
            first={index === 0}
            zoom={renderZoom}
            onWidth={index === 0 ? onWidth : undefined}
          />
        ))}
      </section>
    </ZoomViewport>
  );
}
