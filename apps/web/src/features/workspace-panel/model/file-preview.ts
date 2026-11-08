import { languageOf } from "@/components/markdown/code-tools";

/** The ways a file tab can show a file. */
export type ViewerId = "markdown" | "code" | "text" | "image" | "pdf" | "html" | "table";

export interface Viewer {
  id: ViewerId;
  title: string;
  /** Whether the header offers line wrapping. */
  wrap: boolean;
  /** Read from the file's bytes rather than its text. */
  bytes?: boolean;
}

const MARKDOWN: Viewer = { id: "markdown", title: "Markdown", wrap: false };
const CODE: Viewer = { id: "code", title: "Code", wrap: true };
const TEXT: Viewer = { id: "text", title: "Plain text", wrap: true };
const IMAGE: Viewer = { id: "image", title: "Image", wrap: false, bytes: true };
const PDF: Viewer = { id: "pdf", title: "PDF", wrap: false, bytes: true };
const HTML: Viewer = { id: "html", title: "HTML", wrap: false };
const TABLE: Viewer = { id: "table", title: "Spreadsheet", wrap: false };

const nameOf = (path: string) => (path.split("/").pop() ?? path).toLowerCase();

const RASTER = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);

/** The viewers for a file, the default first. Plain text always applies. */
export function viewersFor(path: string): Viewer[] {
  const name = nameOf(path);
  const suffix = name.slice(name.lastIndexOf(".") + 1);
  if (RASTER.has(suffix)) return [IMAGE];
  if (suffix === "pdf") return [PDF];
  const out: Viewer[] = [];
  if (suffix === "svg") out.push(IMAGE);
  if (suffix === "html" || suffix === "htm") out.push(HTML);
  if (suffix === "csv" || suffix === "tsv") out.push(TABLE);
  if (name.endsWith(".md") || name.endsWith(".markdown")) out.push(MARKDOWN);
  if (languageOf(name).lang) out.push(CODE);
  out.push(TEXT);
  return out;
}

/** Suffixes that cannot be read as text and have no viewer. */
const UNVIEWABLE = new Set(
  `mp4 mov avi mkv webm flv wmv m4v mp3 wav flac ogg m4a aac wma opus zip gz tgz bz2 xz zst 7z rar
   tar jar doc docx xls xlsx ppt pptx odt ods odp pages numbers exe dll so dylib bin o class pyc
   wasm ttf otf woff woff2 eot dmg iso img sqlite db psd ai sketch tiff tif heic heif avif`.split(
    /\s+/,
  ),
);

/** True for a file the panel does not try to read at all. */
export function isUnviewable(path: string): boolean {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");
  return dot !== -1 && UNVIEWABLE.has(name.slice(dot + 1));
}

export type FailureKind = "not-found" | "too-large" | "not-text" | "not-regular" | "other";

export interface FileFailure {
  kind: FailureKind;
  message: string;
}

const KINDS: Record<number, FailureKind> = {
  404: "not-found",
  413: "too-large",
  415: "not-text",
  422: "not-regular",
};

export function fileFailure(status: number, message: string): FileFailure {
  return { kind: KINDS[status] ?? "other", message };
}

/** What to tell the reader. */
export function failureLine(failure: FileFailure): string {
  switch (failure.kind) {
    case "not-found":
      return "File not found. It may have been moved or deleted.";
    case "too-large":
      return "This file exceeds the 2 MB limit and cannot be read.";
    case "not-text":
      return "Preview is not available for this file type yet.";
    case "not-regular":
      return "Not a regular file, nothing to display.";
    case "other":
      return `Read failed: ${failure.message}`;
  }
}

/** With nothing to show: hand the file to another program, try again, or
 * only explain. */
export function failureRecourse(failure: FileFailure): "open" | "retry" | "none" {
  if (failure.kind === "not-text" || failure.kind === "too-large") return "open";
  if (failure.kind === "other") return "retry";
  return "none";
}

/** Where the file tree sits in a file tab's content row. */
export type NavigatorLayout = "push" | "overlay" | "fill";

const FILL_BELOW = 400;
const PUSH_FROM = 560;
const FULLSCREEN_BELOW = 768;
const NAVIGATOR_MIN = 180;

export const NAVIGATOR_DEFAULT = 260;

/** An unmeasured row (width 0) counts as wide. */
export function navigatorLayout(row: number, viewport: number): NavigatorLayout {
  if (viewport < FULLSCREEN_BELOW) return "fill";
  if (row > 0 && row < FILL_BELOW) return "fill";
  return row === 0 || row >= PUSH_FROM ? "push" : "overlay";
}

/** Beside the file the body keeps 320px and the 8px margins; floating over
 * it, 120px of the file stay in view. */
export function clampNavigator(width: number, row: number, layout: NavigatorLayout): number {
  const max = row - (layout === "push" ? 336 : 120);
  return Math.round(Math.max(Math.min(width, max), Math.min(NAVIGATOR_MIN, row)));
}
