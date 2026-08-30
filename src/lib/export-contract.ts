// Export the review-screen document (a Quill Delta) as .docx or .pdf, client-side.
// `docx` and `jspdf` are heavy, so they load on demand.
//
// The Delta→lines walk lives in the pure, testable src/lib/delta-text.ts (also
// used by the template features); this file keeps only the doc/pdf rendering.
// It honours the curated typographic controls from the editor toolbar (issue
// #10): font family, size, colour, alignment, indent, line-height, strike,
// super/subscript, blockquote and code block.

import { deltaToLines, lineText, type Delta, type Line, type Run } from "@/lib/delta-text";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name: string, ext: string): string {
  const base = (name || "contract").replace(/[^\p{L}\p{N} _.-]/gu, "").trim() || "contract";
  return `${base}.${ext}`;
}

/* ── Shared format helpers ─────────────────────────────────────────────────── */

/** `"18px"` → the number 18. `undefined` / unparseable → `undefined`. */
function pxToPt(size: string | undefined): number | undefined {
  if (!size) return undefined;
  const n = parseFloat(size);
  return Number.isFinite(n) ? n * 0.75 : undefined; // 1px ≈ 0.75pt
}

/** Quill colours are `#rgb` / `#rrggbb` / `rgb(r,g,b)`. Normalise to `RRGGBB`. */
function hex6(css: string | undefined): string | undefined {
  if (!css) return undefined;
  const s = css.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split("").map((c) => c + c).join("").toUpperCase();
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);
  if (m) {
    return [m[1], m[2], m[3]]
      .map((v) => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  return undefined;
}

/* ── DOCX ─────────────────────────────────────────────────────────────────── */

const DOCX_FONT: Record<string, string> = { serif: "Georgia", mono: "Courier New" };

async function exportDocx(lines: Line[], title: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const headingFor = (h?: 1 | 2 | 3) =>
    h === 1 ? HeadingLevel.HEADING_1
      : h === 2 ? HeadingLevel.HEADING_2
      : h === 3 ? HeadingLevel.HEADING_3
      : undefined;

  // docx accepts these alignment string literals directly; "both" == justify.
  const alignFor = (a?: Line["align"]): "center" | "right" | "both" | undefined =>
    a === "center" ? "center" : a === "right" ? "right" : a === "justify" ? "both" : undefined;

  const runFor = (r: Run, codeBlock: boolean) => {
    const pt = pxToPt(r.size);
    return new TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      strike: r.strike,
      underline: r.underline ? {} : undefined,
      superScript: r.script === "super",
      subScript: r.script === "sub",
      color: hex6(r.color),
      // Word shading needs a full paragraph style; the closest TextRun knob is highlight,
      // which only takes named colours — skip rather than approximate badly.
      font: codeBlock ? "Courier New" : DOCX_FONT[r.font ?? ""],
      size: pt ? Math.round(pt * 2) : undefined, // docx size is half-points
    });
  };

  const paragraphs = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title })] }),
    ...lines.map((line) => {
      const indentLeft = (line.indent ?? 0) * 480 + (line.blockquote ? 480 : 0);
      const lh = line.lineHeight ? parseFloat(line.lineHeight) : undefined;
      return new Paragraph({
        heading: headingFor(line.header),
        alignment: alignFor(line.align),
        bullet: line.list === "bullet" ? { level: 0 } : undefined,
        numbering: line.list === "ordered" ? { reference: "ol", level: 0 } : undefined,
        indent: indentLeft ? { left: indentLeft } : undefined,
        spacing: {
          after: 120,
          line: lh ? Math.round(lh * 240) : undefined,
          lineRule: lh ? "auto" : undefined,
        },
        children: line.runs.map((r) =>
          runFor(line.blockquote ? { ...r, italic: true } : r, !!line.codeBlock),
        ),
      });
    }),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "ol",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }],
        },
      ],
    },
    sections: [{ children: paragraphs }],
  });

  triggerDownload(await Packer.toBlob(doc), filename);
}

/* ── PDF ──────────────────────────────────────────────────────────────────── */

// jsPDF ships only the 14 standard fonts — map the curated families onto them.
const PDF_FONT: Record<string, string> = { serif: "times", mono: "courier" };

async function exportPdf(lines: Line[], title: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  /** One logical line, already resolved to a single font / size / colour / align.
   *  Mixed inline styling within a line collapses to the first run's — the
   *  curated controls are paragraph-oriented, so this is faithful in practice. */
  const write = (
    text: string,
    opts: {
      size: number;
      font: string;
      bold: boolean;
      italic: boolean;
      align?: Line["align"];
      indent: number;
      color?: string;
      gapAfter: number;
      lineHeight: number;
    },
  ) => {
    const style =
      opts.bold && opts.italic ? "bolditalic" : opts.bold ? "bold" : opts.italic ? "italic" : "normal";
    doc.setFont(opts.font, doc.getFontList()[opts.font]?.includes(style) ? style : "normal");
    doc.setFontSize(opts.size);
    const rgb = opts.color && hex6(opts.color);
    doc.setTextColor(rgb ? `#${rgb}` : "#1a1a1a");

    const left = margin + opts.indent;
    const maxW = pageW - margin - left;
    const wrapped = doc.splitTextToSize(text || " ", maxW) as string[];
    const jsAlign =
      opts.align === "center" ? "center"
        : opts.align === "right" ? "right"
        : opts.align === "justify" ? "justify"
        : "left";
    const x = jsAlign === "center" ? left + maxW / 2 : jsAlign === "right" ? left + maxW : left;
    const step = opts.size * 1.35 * opts.lineHeight;

    wrapped.forEach((w, i) => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      // jsPDF can't justify the last line of a paragraph — left-align it.
      const a = jsAlign === "justify" && i === wrapped.length - 1 ? "left" : jsAlign;
      doc.text(w, x, y, { align: a, maxWidth: a === "justify" ? maxW : undefined });
      y += step;
    });
    y += opts.gapAfter;
    doc.setTextColor("#1a1a1a");
  };

  write(title, { size: 20, font: "times", bold: true, italic: false, indent: 0, gapAfter: 14, lineHeight: 1 });

  for (const line of lines) {
    const r0 = line.runs[0] ?? ({ text: "" } as Run);
    const text = lineText(line);
    const anyBold = line.runs.some((r) => r.bold);
    const anyItalic = line.runs.some((r) => r.italic) || !!line.blockquote;
    const font = line.codeBlock ? "courier" : PDF_FONT[r0.font ?? ""] ?? "times";
    const indent = (line.indent ?? 0) * 22 + (line.blockquote ? 22 : 0);
    const lineHeight = line.lineHeight ? parseFloat(line.lineHeight) : 1;
    const explicitPt = pxToPt(r0.size);

    if (line.header === 1) write(text, { size: 16, font, bold: true, italic: anyItalic, align: line.align, indent, gapAfter: 8, lineHeight });
    else if (line.header === 2) write(text, { size: 14, font, bold: true, italic: anyItalic, align: line.align, indent, gapAfter: 6, lineHeight });
    else if (line.header === 3) write(text, { size: 12, font, bold: true, italic: anyItalic, align: line.align, indent, gapAfter: 5, lineHeight });
    else if (line.list) write(`•  ${text}`, { size: explicitPt ?? 11, font, bold: anyBold, italic: anyItalic, align: line.align, indent, color: r0.color, gapAfter: 3, lineHeight });
    else write(text, { size: explicitPt ?? 11, font, bold: anyBold, italic: anyItalic, align: line.align, indent, color: line.blockquote ? "#666666" : r0.color, gapAfter: 5, lineHeight });
  }

  triggerDownload(doc.output("blob"), filename);
}

/** Public entry point. `format` is "docx" or "pdf". */
export async function exportContract(
  delta: Delta,
  name: string,
  format: "docx" | "pdf",
): Promise<void> {
  const lines = deltaToLines(delta);
  const title = name || "Contract";
  if (format === "docx") await exportDocx(lines, title, safeName(name, "docx"));
  else await exportPdf(lines, title, safeName(name, "pdf"));
}
