// Layers 1 & 2 — pure detection, no model call.
//
//  L1 dictionary : replace the values the app already holds as structured
//                  fields (party names, addresses…). Highest precision.
//  L2 patterns   : regex sweep for shapes the app does NOT hold — email, phone,
//                  IBAN, tax id, dates. Catches free-text PII; will over-match,
//                  which is the point of seeing it in the playground.

import type { PiiKind, PiiMatch } from "./types.ts";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** German inflection tail tolerated on a known value: genitive -s/-es, weak
 *  masculine -n/-en. Deliberately short — enough for `Müllers`, `Herrn Müller`. */
export const DE_SUFFIX = "(?:s|es|n|en)?";

// A letter/number on either side means we're mid-word — not a real occurrence.
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

/** Layer 1: exact (+ optionally inflected) occurrences of known field values. */
export function dictionaryMatches(
  text: string,
  known: { value: string; kind: PiiKind }[],
  germanMorphology: boolean,
): PiiMatch[] {
  const out: PiiMatch[] = [];
  // longest first so "Anna Müller" is consumed before a bare "Müller"
  const ordered = [...known]
    .filter((k) => k.value.trim())
    .sort((a, b) => b.value.trim().length - a.value.trim().length);

  for (const { value, kind } of ordered) {
    const re = new RegExp(
      `${L}${escapeRe(value.trim())}${germanMorphology ? DE_SUFFIX : ""}${R}`,
      "giu",
    );
    for (const m of text.matchAll(re)) out.push({ real: m[0], kind, layer: "dictionary" });
  }
  return out;
}

type Pattern = { kind: PiiKind; re: RegExp; group?: number };

const PATTERNS: Pattern[] = [
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "iban", re: /\bDE\d{2}(?:\s?\d{4}){4}\s?\d{2}\b/gi },
  {
    kind: "tax-id",
    re: /(?:Steuer-?ID|Steuernummer|St\.-?Nr\.?|IdNr\.?)[:\s]*([\d][\d\s/]{8,})/gi,
    group: 1,
  },
  // +49… or 0… with at least 7 digits total, separators allowed
  { kind: "phone", re: /(?:\+49|0)(?:[\s\-/]?\d){7,}/g },
  { kind: "date", re: /\b\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\b/g },
];

/** Layer 2: shape-based sweep. */
export function patternMatches(text: string): PiiMatch[] {
  const out: PiiMatch[] = [];
  for (const { kind, re, group } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const real = (group != null ? m[group] : m[0])?.trim();
      if (real) out.push({ real, kind, layer: "patterns" });
    }
  }
  return out;
}
