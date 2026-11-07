import { isValidElement, memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import CodeCard from "./CodeCard";

interface MarkdownProps {
  text: string;
  className?: string;
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
    // Unsafe protocols arrive with an empty href; local paths have no
    // opener yet, so both stay as text.
    if (!href || !WEB_LINK.test(href)) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
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
function Markdown({ text, className }: MarkdownProps) {
  return (
    <div className={cn("markdown text-sm leading-6 break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkLiteralHtml]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
