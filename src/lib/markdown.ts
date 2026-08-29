// Markdown → HTML for the contract editor.
//
// Generated contracts (and AI whole-document edits) come back as Markdown:
// `**bold**`, `### § 1`, `---`, `1.` lists. Quill is a rich-text editor, not a
// Markdown renderer, so pasting the raw string shows the literal `*`/`#`.
// We detect Markdown and convert it to HTML that `quill.clipboard.convert()`
// turns into real headings / bold / lists.
//
// Uploaded contracts arrive from LLMWhisperer as plain layout-preserving text
// (numbered `1.` clauses, `-----` rules). `looksLikeMarkdown()` is deliberately
// conservative so that text is left untouched.

import { marked } from "marked";

/** Page separator LLMWhisperer inserts (see /api/extract `page_seperator`). */
const PAGE_SEPARATOR = /^<<<\s*$/gm;

/**
 * True only for signals a plain contract is very unlikely to contain:
 * an ATX heading (`# ` … `###### `), inline `**bold**`, a fenced code block,
 * or a bullet list with `-`/`*` markers. A bare `1.` list or a `---` rule alone
 * does NOT count — plain extracted contracts have those.
 */
export function looksLikeMarkdown(s: string): boolean {
  if (!s) return false;
  return (
    /(^|\n)#{1,6}\s+\S/.test(s) ||
    /\*\*[^*\n]+\*\*/.test(s) ||
    /(^|\n)```/.test(s) ||
    /(^|\n)[ \t]*[-*][ \t]+\S/.test(s)
  );
}

/** Strip LLMWhisperer `<<<` page markers; collapse the blank lines they leave. */
export function stripPageSeparators(s: string): string {
  return s.replace(PAGE_SEPARATOR, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Convert Markdown to HTML for Quill. `breaks: true` keeps single newlines as
 * line breaks (contracts rely on them); `gfm: true` for `---`, tables, etc.
 * Quill's clipboard only keeps whitelisted blots, so the HTML needs no
 * separate sanitiser.
 */
export function markdownToHtml(s: string): string {
  return marked.parse(stripPageSeparators(s), {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;
}
