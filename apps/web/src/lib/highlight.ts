/**
 * Syntax highlighting with Shiki (ADR 0013). Shiki and each grammar load on
 * first use, so pages without code pay nothing. Uses the JavaScript regex
 * engine, which needs no WebAssembly.
 */
import type { BundledLanguage, HighlighterGeneric } from "shiki";

export interface HighlightToken {
  content: string;
  /** Inline style: `--shiki-light` and `--shiki-dark` colours, font style. */
  style: Record<string, string>;
}

const THEMES = { light: "github-light", dark: "github-dark" } as const;

type Highlighter = HighlighterGeneric<BundledLanguage, "github-light" | "github-dark">;

let highlighter: Promise<{ hl: Highlighter; known: Set<string> }> | null = null;

function load() {
  highlighter ??= (async () => {
    const [{ createHighlighter, bundledLanguages }, { createJavaScriptRegexEngine }] =
      await Promise.all([import("shiki"), import("shiki/engine/javascript")]);
    const hl = (await createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })) as Highlighter;
    return { hl, known: new Set(Object.keys(bundledLanguages)) };
  })();
  return highlighter;
}

/**
 * Tokenises `code` as `lang`, one array per line, or returns `null` when the
 * language is unknown or highlighting fails.
 */
export async function highlight(code: string, lang: string): Promise<HighlightToken[][] | null> {
  const id = lang.trim().toLowerCase();
  if (!id) return null;
  try {
    const { hl, known } = await load();
    if (!known.has(id)) return null;
    if (!hl.getLoadedLanguages().includes(id)) await hl.loadLanguage(id as BundledLanguage);
    const lines = hl.codeToTokensWithThemes(code, {
      lang: id as BundledLanguage,
      themes: THEMES,
    });
    return lines.map((line) =>
      line.map((token) => {
        const light = token.variants.light;
        const dark = token.variants.dark;
        const style: Record<string, string> = {};
        if (light?.color) style["--shiki-light"] = light.color;
        if (dark?.color) style["--shiki-dark"] = dark.color;
        if (light?.fontStyle && light.fontStyle & 1) style.fontStyle = "italic";
        if (light?.fontStyle && light.fontStyle & 2) style.fontWeight = "bold";
        return { content: token.content, style };
      }),
    );
  } catch {
    return null;
  }
}
