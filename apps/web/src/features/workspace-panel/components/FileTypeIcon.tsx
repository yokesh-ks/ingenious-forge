import {
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BLUE = "text-blue-600 dark:text-blue-400";

const groups: [string, LucideIcon, string][] = [
  ["md mdx markdown txt", FileTextIcon, BLUE],
  [
    "ts tsx js jsx mjs cjs rs py go java c h cpp cc hpp rb php sh bash zsh css scss less html htm vue svelte swift kt sql",
    FileCodeIcon,
    BLUE,
  ],
  ["json yaml yml toml ini xml", FileJsonIcon, "text-amber-600 dark:text-amber-400"],
  ["csv tsv xls xlsx", FileSpreadsheetIcon, "text-green-600 dark:text-green-400"],
  ["png jpg jpeg gif svg webp bmp ico avif", FileImageIcon, "text-violet-500"],
  ["mp4 mov avi mkv webm", FileVideoIcon, "text-violet-500"],
  ["pdf", FileTextIcon, "text-red-600 dark:text-red-400"],
];

const BY_SUFFIX = new Map(
  groups.flatMap(([suffixes, icon, tone]) =>
    suffixes.split(" ").map((suffix) => [suffix, { icon, tone }] as const),
  ),
);

/** A coloured icon for the kind of file `path` is. */
export default function FileTypeIcon({ path, className }: { path: string; className?: string }) {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const dot = name.lastIndexOf(".");
  const known = dot === -1 ? undefined : BY_SUFFIX.get(name.slice(dot + 1));
  const Icon = known?.icon ?? FileIcon;
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0", known?.tone ?? "text-muted-foreground", className)}
    />
  );
}
