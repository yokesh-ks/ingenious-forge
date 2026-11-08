import { createContext, useContext } from "react";

/** A file to show in the workspace panel. */
export interface FileTarget {
  /** Relative to the project, or absolute. */
  path: string;
  line?: number;
}

export type OpenFile = (target: FileTarget) => void;

/** Opens a file in the workspace panel; absent where there is no panel. */
export const OpenFileContext = createContext<OpenFile | null>(null);

export const useOpenFile = () => useContext(OpenFileContext);

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const DRIVE = /^[a-z]:[\\/]/i;
/** `a.ts:7`, which looks like a scheme but names a line. */
const PATH_WITH_LINE = /^[^:]*[./][^:]*:\d+(?::\d+)?(?:[?#]|$)/;

export const isPathWithLine = (href: string) => PATH_WITH_LINE.test(href);

/** `path` with `.` and `..` worked out. A `..` that climbs past the start is
 * kept, for the server to refuse. */
function normalize(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else if (part !== ".." || !absolute) out.push(part);
  }
  return `${absolute ? "/" : ""}${out.join("/")}`;
}

/**
 * The file a Markdown link points to, or `null` when it is not a file link.
 * Relative links start from `baseDir`; `#L12` and a trailing `:12` name a
 * line.
 */
export function parseFileLink(href: string, baseDir = ""): FileTarget | null {
  if (href.startsWith("#")) return null;
  if (SCHEME.test(href) && !DRIVE.test(href) && !PATH_WITH_LINE.test(href)) return null;
  const hash = href.indexOf("#");
  const fragment = hash === -1 ? "" : href.slice(hash + 1);
  let path = hash === -1 ? href : href.slice(0, hash);
  const query = path.indexOf("?");
  if (query !== -1) path = path.slice(0, query);
  try {
    path = decodeURIComponent(path);
  } catch {
    // Not percent-encoded after all: the text is the path.
  }
  let line = /^L(\d+)/.exec(fragment)?.[1];
  const suffix = /:(\d+)(?::\d+)?$/.exec(path);
  if (suffix && !DRIVE.test(path.slice(0, suffix.index + 1))) {
    line ??= suffix[1];
    path = path.slice(0, suffix.index);
  }
  if (!path) return null;
  const joined = path.startsWith("/") || !baseDir ? path : `${baseDir}/${path}`;
  const normalized = normalize(joined);
  if (!normalized || normalized === "/") return null;
  return line ? { path: normalized, line: Number(line) } : { path: normalized };
}

/** `path` relative to the project at `root`; a path outside stays as given. */
export function toProjectPath(path: string, root: string | null | undefined): string {
  const normalized = normalize(path);
  const top = root?.replace(/\/+$/, "");
  if (top && normalized.startsWith(`${top}/`)) return normalized.slice(top.length + 1);
  return normalized;
}
