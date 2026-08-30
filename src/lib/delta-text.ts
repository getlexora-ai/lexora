// Flatten a Quill Delta into structured lines / plain text.
//
// Pure — NO `@/` imports, NO next/server, relative imports only — so
// `node --test` can import it directly (see src/lib/clause-taxonomy.ts:1-10).
// Lifted verbatim from src/lib/export-contract.ts so the .docx / .pdf export
// and the template features (from-contract, suggest-variables) share one walk.

export type Attr = Record<string, unknown>;
export type DeltaOp = { insert?: string | object; attributes?: Attr };
export type Delta = { ops?: DeltaOp[] };

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
export type Line = { runs: Run[]; header?: 1 | 2 | 3; list?: "bullet" | "ordered" };

/** Flatten a Quill Delta into lines with block + inline formatting. */
export function deltaToLines(delta: Delta): Line[] {
  const lines: Line[] = [];
  let runs: Run[] = [];

  const pushLine = (blockAttrs: Attr | undefined) => {
    const headerRaw = blockAttrs?.header;
    const header =
      headerRaw === 1 || headerRaw === 2 || headerRaw === 3 ? headerRaw : undefined;
    const listRaw = blockAttrs?.list;
    const list =
      listRaw === "bullet" ? "bullet" : listRaw === "ordered" ? "ordered" : undefined;
    lines.push({ runs: runs.length ? runs : [{ text: "" }], header, list });
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
        runs.push({
          text: part,
          bold: !!a.bold,
          italic: !!a.italic,
          underline: !!a.underline,
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
  if (run.underline) core = `<u>${core}</u>`;
  return lead + core + trail;
}

/**
 * Serialise a Quill Delta to Markdown, preserving headings, bold / italic /
 * underline, and list structure. The inverse of `markdownToHtml()` →
 * `quill.clipboard.convert()`. Used for the Ask-AI edit round-trip so the model
 * sees — and is asked to return — real document structure instead of the
 * flattened `quill.getText()` plain text that silently dropped it (issue #7).
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
      if (line.header)            return `${"#".repeat(line.header)} ${body}`;
      return body;
    })
    .join("\n");
}
