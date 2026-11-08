import { createContext, isValidElement, memo, type ReactNode, useContext, useMemo } from "react";
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isPathWithLine, parseFileLink, useOpenFile } from "@/lib/open-file";
import { cn } from "@/lib/utils";
import CodeCard from "./CodeCard";

interface MarkdownProps {
  text: string;
  className?: string;
  /** The folder relative links start from; the project's top by default. */
  baseDir?: string;
}

const BaseDir = createContext("");

/** The usual safe-link filter, which would take `a.ts:7` for a scheme. */
const safeUrl = (url: string) => (isPathWithLine(url) ? url : defaultUrlTransform(url));

const LINK = "text-primary underline underline-offset-2";

/** A link: to the web in a new tab, to a project file in the workspace
 * panel. Without a place to open it, or with an unsafe protocol (which
 * arrives with an empty href), it stays as text. */
function Anchor({ href, children }: { href?: string; children?: ReactNode }) {
  const openFile = useOpenFile();
  const baseDir = useContext(BaseDir);
  if (href && WEB_LINK.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {children}
      </a>
    );
  }
  const target = href && openFile ? parseFileLink(href, baseDir) : null;
  if (!target || !openFile) return <span>{children}</span>;
  return (
    <a
      href={href}
      className={LINK}
      onClick={(event) => {
        event.preventDefault();
        openFile(target);
      }}
    >
      {children}
    </a>
  );
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** Shows raw HTML as literal text instead of rendering or dropping it. */
function remarkLiteralHtml() {
  return (tree: MdNode) => {
    const visit = (node: MdNode) => {
      if (node.type === "html") node.type = "text";
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const WEB_LINK = /^https?:\/\//i;

const components: Components = {
  a({ href, children }) {
    return <Anchor href={href}>{children}</Anchor>;
  },
  pre({ children }) {
    const code = isValidElement<{ className?: string; children?: unknown }>(children)
      ? children
      : null;
    const lang = /language-([^\s]+)/.exec(code?.props.className ?? "")?.[1] ?? "";
    const raw = typeof code?.props.children === "string" ? code.props.children : "";
    return <CodeCard code={raw.replace(/\n$/, "")} lang={lang} />;
  },
  code({ children }) {
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>;
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border-b px-2 py-1 text-left font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b px-2 py-1 align-top">{children}</td>;
  },
  img({ src, alt }) {
    return typeof src === "string" && WEB_LINK.test(src) ? (
      <img src={src} alt={alt ?? ""} className="max-w-full rounded" />
    ) : (
      <span>{alt}</span>
    );
  },
};

/**
 * Renders untrusted Markdown (ADR 0013): GitHub-flavoured, raw HTML shown as
 * text, unsafe links inert, fenced code as code cards.
 */
function Markdown({ text, className, baseDir = "" }: MarkdownProps) {
  const body = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkLiteralHtml]}
        components={components}
        urlTransform={safeUrl}
      >
        {text}
      </ReactMarkdown>
    ),
    [text],
  );
  return (
    <BaseDir.Provider value={baseDir}>
      <div className={cn("markdown text-sm leading-6 break-words", className)}>{body}</div>
    </BaseDir.Provider>
  );
}

export default memo(Markdown);
