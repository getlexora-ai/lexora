// Parse the curated RAG corpus (src/lib/rag/corpus/*.md) into clause-library
// rows. Pure — imports only ./rag/corpus (itself pure) and ./clause-taxonomy —
// so `node --test` runs it against the real corpus with no network or key.
//
// Two sources:
//   1. every doc's `## Musterformulierung` block  → one row (doc 18 → two)
//   2. doc 22's `## § N …` sections               → eleven rows
//
// The clause text is de-wrapped (the corpus is hard-wrapped at ~95 cols),
// German quotes and markdown bold are stripped, and `[Platzhalter]` tokens are
// kept verbatim — a library clause is a starting point, not a finished contract.

import { loadCorpus } from "../rag/corpus.ts";
import {
  DOCS_WITHOUT_MODEL_CLAUSE,
  DOC_TO_TOPIC,
  topicForParagraph,
  topicLabel,
} from "../clause-taxonomy.ts";

export type ParsedClause = {
  doc_ref: string;
  clause_type: string;
  title: string;
  content: string;
  summary: string;
  reference: string | null;
  tags: string[];
  posture: "preferred" | "fallback" | "walk_away";
};

// Docs whose model clause describes an *alternative* rent model rather than the
// default position — seeded as a fallback so a playbook can offer it as the
// compromise, not the ask.
const FALLBACK_DOCS = new Set(["07-staffelmiete-557a", "08-indexmiete-557b"]);

// Reused from src/lib/rag/retrieve.ts:57 — "§ 551 BGB", "§ 558 Abs. 3 BGB", …
const STATUTE_RE = /§\s?\d+[a-z]?(?:\s?(?:Abs\.?\s?\d+|S\.?\s?\d+|Nr\.?\s?\d+|BGB|BetrKV|BImA))*/gi;

/** First statutory reference in `text`, normalised, or null. Prefers a match that names a code. */
export function firstStatuteRef(text: string): string | null {
  const matches = text.match(STATUTE_RE);
  if (!matches || matches.length === 0) return null;
  const norm = (s: string) => s.replace(/\s+/g, " ").replace(/§(?=\d)/, "§ ").trim();
  const withCode = matches.find((m) => /BGB|BetrKV|BImA/i.test(m));
  return norm(withCode ?? matches[0]);
}

/** Collapse the corpus' hard line-wraps: join wrapped lines, keep paragraph breaks. */
export function dewrap(s: string): string {
  return s
    .replace(/­/g, "") // soft hyphens (doc 22 § 11 "Betriebskosten­auf­stellung")
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** De-wrap, then strip markdown bold (which in the corpus can span a line break). */
function cleanClause(raw: string): string {
  return dewrap(raw).replace(/\*\*([\s\S]+?)\*\*/g, "$1").trim();
}

/**
 * Every quoted span in a Musterformulierung block. The corpus opens clauses
 * with „ (U+201E) and closes with an ASCII " — no clause text contains a raw
 * ASCII ", so a non-greedy „…" match cleanly separates variants (doc 18 has 2).
 */
export function extractQuotedVariants(block: string): string[] {
  return [...block.matchAll(/„([\s\S]*?)"/g)].map((m) => cleanClause(m[1]));
}

/** Parse the 21 `## Musterformulierung` blocks into clause rows. */
export function parseModelClauses(): ParsedClause[] {
  const rows: ParsedClause[] = [];

  for (const doc of loadCorpus()) {
    if (DOCS_WITHOUT_MODEL_CLAUSE.has(doc.id)) continue;

    const topic = DOC_TO_TOPIC[doc.id];
    if (!topic) {
      throw new Error(
        `parseModelClauses: corpus doc "${doc.id}" is not in DOC_TO_TOPIC — ` +
          `add it to src/lib/clause-taxonomy.ts`,
      );
    }

    const marker = "## Musterformulierung";
    const start = doc.body.indexOf(marker);
    if (start === -1) {
      throw new Error(`parseModelClauses: no "${marker}" block in "${doc.id}"`);
    }
    let block = doc.body.slice(start + marker.length);
    const nextHeading = block.indexOf("\n## ");
    if (nextHeading !== -1) block = block.slice(0, nextHeading);

    const variants = extractQuotedVariants(block);
    if (variants.length === 0) {
      throw new Error(`parseModelClauses: "${doc.id}" Musterformulierung has no quoted clause`);
    }

    variants.forEach((content, i) => {
      const isFallback = i > 0 || FALLBACK_DOCS.has(doc.id);
      rows.push({
        doc_ref: i === 0 ? doc.id : `${doc.id}#v${i + 1}`,
        clause_type: topic,
        title: i === 0 ? doc.title : `${doc.title} — Variante ${i + 1}`,
        content,
        summary: `Musterklausel — ${topicLabel(topic)}`,
        reference: firstStatuteRef(`${doc.title}\n${content}\n${doc.source}`),
        tags: doc.tags,
        posture: isFallback ? "fallback" : "preferred",
      });
    });
  }

  return rows;
}

/** Parse doc 22's `## § N …` sections into eleven clause rows. */
export function parseTemplateClauses(): ParsedClause[] {
  const doc = loadCorpus().find((d) => d.id === "22-standard-wohnraummietvertrag-vorlage");
  if (!doc) throw new Error("parseTemplateClauses: corpus doc 22 not found");

  const rows: ParsedClause[] = [];

  for (const part of doc.body.split(/\n(?=## )/)) {
    const heading = part.match(/^## (§\s?(\d+)\s+[^\n]+)/);
    if (!heading) continue; // skips "## Aufbau" and "## Unterschriften"

    const para = Number(heading[2]);
    const topic = topicForParagraph(para);
    if (!topic) {
      throw new Error(`parseTemplateClauses: doc 22 § ${para} has no topic mapping`);
    }

    const quoted = part.match(/„([\s\S]*?)"/);
    if (!quoted) {
      throw new Error(`parseTemplateClauses: doc 22 "${heading[1]}" has no quoted clause`);
    }

    const content = cleanClause(quoted[1]);
    rows.push({
      doc_ref: `22-vorlage#p${para}`,
      clause_type: topic,
      title: heading[1].replace(/\s+/g, " ").trim(),
      content,
      summary: `Standard-Wohnraummietvertrag — ${topicLabel(topic)}`,
      reference: firstStatuteRef(content),
      tags: [...doc.tags, topic],
      posture: "preferred",
    });
  }

  if (rows.length !== 11) {
    throw new Error(`parseTemplateClauses: expected 11 §-clauses from doc 22, got ${rows.length}`);
  }
  return rows;
}

/** The full curated seed set: model clauses + the standard-lease §-clauses. */
export function parseCuratedLibrary(): ParsedClause[] {
  const rows = [...parseModelClauses(), ...parseTemplateClauses()];

  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.doc_ref)) {
      throw new Error(`parseCuratedLibrary: duplicate doc_ref "${r.doc_ref}"`);
    }
    seen.add(r.doc_ref);
  }
  return rows;
}
