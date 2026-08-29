// Split corpus docs into retrieval chunks.
//
// Strategy: cut on markdown headings (##, ###), then GREEDILY PACK consecutive
// sections up to TARGET chars so we don't emit dozens of 200-char fragments
// (fewer, denser chunks retrieve better and keep us under the embedding-API
// request quota). A single section longer than TARGET is split on paragraph
// boundaries with a small overlap.

import type { Chunk, CorpusDoc } from "./types.ts";

const TARGET = 900; // soft max chars per chunk
const HARD = 1300; // never emit a chunk longer than this
const OVERLAP = 160; // chars of tail carried into the next sub-chunk

type Section = { heading: string; text: string };

function splitIntoSections(doc: CorpusDoc): Section[] {
  const lines = doc.body.split("\n");
  const sections: Section[] = [];
  let heading = doc.title;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.*)$/);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/** Break an over-long section on blank lines, keeping OVERLAP chars of context. */
function packParagraphs(text: string): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";

  for (const para of paras) {
    if (cur && cur.length + para.length + 2 > HARD) {
      out.push(cur);
      const tail = cur.slice(-OVERLAP);
      const brk = tail.indexOf(" ");
      cur = (brk === -1 ? tail : tail.slice(brk + 1)) + "\n\n" + para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Turn one doc into 1..n chunks. */
export function chunkDoc(doc: CorpusDoc): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;
  const push = (heading: string, text: string) => {
    chunks.push({
      id: `${doc.id}#${ordinal++}`,
      docId: doc.id,
      docTitle: doc.title,
      heading,
      tags: doc.tags,
      text,
    });
  };

  let pendHeading = "";
  let pendText = "";
  const flushPending = () => {
    if (pendText) push(pendHeading || doc.title, pendText);
    pendHeading = "";
    pendText = "";
  };

  for (const section of splitIntoSections(doc)) {
    if (section.text.length > TARGET) {
      // Big section: flush what's buffered, then emit it on its own.
      flushPending();
      const pieces =
        section.text.length <= HARD ? [section.text] : packParagraphs(section.text);
      for (const piece of pieces) push(section.heading, piece);
      continue;
    }
    // Small section: append to the running chunk, or start a new one.
    const combined = pendText ? `${pendText}\n\n## ${section.heading}\n${section.text}` : section.text;
    if (pendText && combined.length > TARGET) {
      flushPending();
      pendHeading = section.heading;
      pendText = section.text;
    } else {
      if (!pendText) pendHeading = section.heading;
      pendText = combined;
    }
  }
  flushPending();

  return chunks;
}

/** Chunk a whole corpus. */
export function chunkCorpus(docs: CorpusDoc[]): Chunk[] {
  return docs.flatMap(chunkDoc);
}

/** The string actually handed to the embedder — heading gives lexical context. */
export function embedText(chunk: Chunk): string {
  return `${chunk.docTitle} — ${chunk.heading}\n\n${chunk.text}`;
}
