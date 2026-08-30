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
