// Export the review-screen document (a Quill Delta) as .docx or .pdf, client-side.
// `docx` and `jspdf` are heavy, so they load on demand.

type Attr = Record<string, unknown>;
type DeltaOp = { insert?: string | object; attributes?: Attr };
type Delta = { ops?: DeltaOp[] };

type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
type Line = { runs: Run[]; header?: 1 | 2 | 3; list?: "bullet" | "ordered" };

/** Flatten a Quill Delta into lines with block + inline formatting. */
function deltaToLines(delta: Delta): Line[] {
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
  while (lines.length && !lines[0].runs.some(r => r.text.trim())) lines.shift();
  while (lines.length && !lines[lines.length - 1].runs.some(r => r.text.trim())) lines.pop();
  return lines;
}

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

async function exportDocx(lines: Line[], title: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const headingFor = (h?: 1 | 2 | 3) =>
    h === 1 ? HeadingLevel.HEADING_1
      : h === 2 ? HeadingLevel.HEADING_2
      : h === 3 ? HeadingLevel.HEADING_3
      : undefined;

  const paragraphs = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title })] }),
    ...lines.map(
      line =>
        new Paragraph({
          heading: headingFor(line.header),
          bullet: line.list === "bullet" ? { level: 0 } : undefined,
          numbering: line.list === "ordered" ? { reference: "ol", level: 0 } : undefined,
          spacing: { after: 120 },
          children: line.runs.map(
            r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined }),
          ),
        }),
    ),
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

async function exportPdf(lines: Line[], title: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  const write = (text: string, size: number, bold: boolean, gapAfter: number) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text || " ", maxW) as string[];
    for (const w of wrapped) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(w, margin, y);
      y += size * 1.35;
    }
    y += gapAfter;
  };

  write(title, 20, true, 14);
  for (const line of lines) {
    const text = line.runs.map(r => r.text).join("");
    const anyBold = line.runs.some(r => r.bold);
    if (line.header === 1) write(text, 16, true, 8);
    else if (line.header === 2) write(text, 14, true, 6);
    else if (line.header === 3) write(text, 12, true, 5);
    else if (line.list) write(`•  ${text}`, 11, anyBold, 3);
    else write(text, 11, anyBold, 5);
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
