// Flatten a Quill Delta into structured lines / plain text.
//
// Pure — NO `@/` imports, NO next/server, relative imports only — so
// `node --test` can import it directly (see src/lib/clause-taxonomy.ts:1-10).
// Lifted verbatim from src/lib/export-contract.ts so the .docx / .pdf export
// and the template features (from-contract, suggest-variables) share one walk.

export type Attr = Record<string, unknown>;
export type DeltaOp = { insert?: string | object; attributes?: Attr };
export type Delta = { ops?: DeltaOp[] };

export type Align  = "left" | "center" | "right" | "justify";
export type Script = "super" | "sub";

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  script?: Script;
  /** CSS colour string as Quill stores it (`#e60000`, `rgb(...)`). */
  color?: string;
  background?: string;
  /** Font class value: `serif` | `mono` (default sans → undefined). */
  font?: string;
  /** Literal CSS size, always `<n>px` (see FONT_SIZES in review/page.tsx). */
  size?: string;
};

export type Line = {
  runs: Run[];
  header?: 1 | 2 | 3;
  list?: "bullet" | "ordered";
  align?: Align;
  /** Quill indent level (1‑8); each step is one tab stop. */
  indent?: number;
  /** Literal `line-height` multiplier, e.g. `"1.5"`. */
  lineHeight?: string;
  blockquote?: boolean;
  codeBlock?: boolean;
};

/** Flatten a Quill Delta into lines with block + inline formatting. */
export function deltaToLines(delta: Delta): Line[] {
  const lines: Line[] = [];
  let runs: Run[] = [];

  const pushLine = (blockAttrs: Attr | undefined) => {
    const a = blockAttrs ?? {};
    const headerRaw = a.header;
    const header =
      headerRaw === 1 || headerRaw === 2 || headerRaw === 3 ? headerRaw : undefined;
    const listRaw = a.list;
    const list =
      listRaw === "bullet" ? "bullet" : listRaw === "ordered" ? "ordered" : undefined;
    const align =
      a.align === "center" || a.align === "right" || a.align === "justify"
        ? (a.align as Align)
        : undefined;
    const indent = typeof a.indent === "number" && a.indent > 0 ? a.indent : undefined;
    const lineHeight = typeof a.lineheight === "string" ? a.lineheight : undefined;
    lines.push({
      runs: runs.length ? runs : [{ text: "" }],
      header,
      list,
      align,
      indent,
      lineHeight,
      blockquote: a.blockquote === true || undefined,
      // `code-block` is `true`, or a language string ("plain", "javascript", …)
      // when the syntax module is active.
      codeBlock: (a["code-block"] != null && a["code-block"] !== false) || undefined,
    });
    runs = [];
  };

  for (const op of delta.ops ?? []) {
    if (typeof op.insert !== "string") {
      // embeds (images etc.) — skip, contracts are text
      continue;
    }
    const a = op.attributes ?? {};
    const parts = op.insert.split("\n");
    parts.forEach((part, i) => {
      if (part) {
        const script = a.script === "super" || a.script === "sub" ? (a.script as Script) : undefined;
        runs.push({
          text: part,
          bold: !!a.bold,
          italic: !!a.italic,
          underline: !!a.underline,
          strike: !!a.strike,
          script,
          color: typeof a.color === "string" ? a.color : undefined,
          background: typeof a.background === "string" ? a.background : undefined,
          font: typeof a.font === "string" ? a.font : undefined,
          size: typeof a.size === "string" ? a.size : undefined,
        });
      }
      // every split point except the last is a real newline → close the line
      if (i < parts.length - 1) pushLine(a);
    });
  }
  if (runs.length) pushLine(undefined);

  // drop leading/trailing empty lines
  while (lines.length && !lines[0].runs.some((r) => r.text.trim())) lines.shift();
  while (lines.length && !lines[lines.length - 1].runs.some((r) => r.text.trim())) lines.pop();
  return lines;
}

/** The plain-text content of one flattened line. */
export function lineText(line: Line): string {
  return line.runs.map((r) => r.text).join("");
}

/** Flatten a Quill Delta to plain text — one `\n` per line, no formatting. */
export function deltaToText(delta: Delta): string {
  return deltaToLines(delta).map(lineText).join("\n");
}

/** Wrap a run's text in Markdown emphasis, keeping surrounding whitespace
 *  outside the markers (`**bold** ` not `**bold **`, which marked won't parse). */
function markRun(run: Run): string {
  const t = run.text;
  if (!t) return t;
  const lead  = t.match(/^\s*/)?.[0] ?? "";
  const trail = t.match(/\s*$/)?.[0] ?? "";
  let core = t.slice(lead.length, t.length - trail.length);
  if (!core) return t;
  if (run.bold)      core = `**${core}**`;
  if (run.italic)    core = `*${core}*`;
  if (run.strike)    core = `~~${core}~~`;
  if (run.underline) core = `<u>${core}</u>`;
  return lead + core + trail;
}

/**
 * Serialise a Quill Delta to Markdown, preserving headings, bold / italic /
 * underline / strike, blockquotes, code blocks, and list structure. The inverse
 * of `markdownToHtml()` → `quill.clipboard.convert()`. Used for the Ask-AI edit
 * round-trip so the model sees — and is asked to return — real document
 * structure instead of the flattened `quill.getText()` plain text that silently
 * dropped it (issue #7).
 *
 * Markdown has no representation for font family, size, colour, alignment,
 * indent, or line-height, so those attributes do NOT survive an AI whole-document
 * edit. That is by design — the round-trip is deliberately Markdown — and is
 * tracked with issue #7; a targeted edit that leaves a run untouched keeps its
 * delta attributes intact.
 */
export function deltaToMarkdown(delta: Delta): string {
  let ordinal = 0;
  return deltaToLines(delta)
    .map((line) => {
      const body = line.runs.map(markRun).join("");
      if (line.list === "ordered") {
        ordinal += 1;
        return `${ordinal}. ${body}`;
      }
      ordinal = 0;
      if (line.list === "bullet") return `- ${body}`;
      if (line.codeBlock)         return `    ${lineText(line)}`;
      if (line.blockquote)        return `> ${body}`;
      if (line.header)            return `${"#".repeat(line.header)} ${body}`;
      return body;
    })
    .join("\n");
}
