import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type HighlightToken, highlight } from "@/lib/highlight";

/** A small icon button with a tooltip, as code card headers use. Needs a
 * `TooltipProvider` above it. */
export function IconButton({
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
          className="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Copies `text` to the clipboard; `copied` stays true for 1.5 s after. */
export function useCopy(text: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };
  return { copied, copy };
}

/** `code` tokenised as `lang`, one array per line, once Shiki has loaded;
 * `null` until then or when the language is unknown. */
export function useHighlight(code: string, lang: string): HighlightToken[][] | null {
  const [tokens, setTokens] = useState<HighlightToken[][] | null>(null);
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
  return tokens;
}

/** One line of highlighted tokens. */
export function TokenLine({ tokens }: { tokens: HighlightToken[] }) {
  return (
    <>
      {tokens.map((token, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: position is the token's identity
        <span key={at} data-token="" className="shiki-token" style={token.style}>
          {token.content}
        </span>
      ))}
    </>
  );
}

const LANGUAGES: Record<string, string> = {
  md: "markdown",
  mdx: "mdx",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  rs: "rust",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  css: "css",
  html: "html",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  rb: "ruby",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
};

/** A file's extension, for its badge, and the highlighting language. */
export function languageOf(path: string): { badge: string; lang: string } {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return { badge: ext, lang: LANGUAGES[ext] ?? "" };
}
