// PII pseudonymisation core — pure orchestration over `detect` + `pseudonyms`.
//
// The pipeline the playground exercises:
//
//   collectMatches(text)            L1 dictionary + L2 patterns  (pure)
//     + llmScan(text)               L3, from ./llm-scan          (impure — added by the caller)
//   buildMap(matches, style)        dedupe → assign pseudonyms
//   sanitize(text, map)             real  → pseudonym   (what the LLM sees)
//   …call the LLM…
//   desanitize(reply, map)          pseudonym → real   (what the user sees)
//   auditLeaks / auditResidual      did anything slip through either way?
//
// NO `@/` imports here — kept node-testable.

import type { PiiEntry, PiiKind, PiiMap, PiiMatch, PseudonymStyle } from "./types.ts";
import { fakeFor, hash } from "./pseudonyms.ts";
import { dictionaryMatches, patternMatches, DE_SUFFIX } from "./detect.ts";

export * from "./types.ts";
export { dictionaryMatches, patternMatches } from "./detect.ts";
export { fakeFor } from "./pseudonyms.ts";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

const KIND_LABEL: Record<PiiKind, string> = {
  name: "NAME", address: "ADDR", email: "EMAIL", phone: "PHONE",
  iban: "IBAN", "tax-id": "TAXID", date: "DATE", other: "PII",
};

export type CollectOptions = {
  knownValues: { value: string; kind: PiiKind }[];
  useDictionary: boolean;
  usePatterns: boolean;
  germanMorphology: boolean;
};

/** L1 + L2 matches. L3 (LLM) matches are produced out of band and concatenated. */
export function collectMatches(text: string, opts: CollectOptions): PiiMatch[] {
  const out: PiiMatch[] = [];
  if (opts.useDictionary)
    out.push(...dictionaryMatches(text, opts.knownValues, opts.germanMorphology));
  if (opts.usePatterns) out.push(...patternMatches(text));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Collapse matches to one entry per distinct value:
 * - first layer to report a value wins (dictionary before patterns before llm-scan)
 * - a value wholly contained in a longer surviving value is dropped
 *   (`Müller` when `Anna Müller` is already covered)
 */
export function dedupeMatches(matches: PiiMatch[]): PiiMatch[] {
  // first occurrence of each distinct value, kept in source order
  const seen = new Set<string>();
  const firstSeen: PiiMatch[] = [];
  for (const m of matches) {
    const k = norm(m.real);
    if (!seen.has(k)) {
      seen.add(k);
      firstSeen.push(m);
    }
  }
  // drop a value wholly contained in a longer surviving value
  return firstSeen.filter(
    (m) =>
      !firstSeen.some(
        (o) => o !== m && o.real.length > m.real.length && norm(o.real).includes(norm(m.real)),
      ),
  );
}

/** Assign a deterministic pseudonym to every deduped match. */
export function buildMap(matches: PiiMatch[], style: PseudonymStyle): PiiMap {
  const counters: Partial<Record<PiiKind, number>> = {};
  const entries: PiiEntry[] = dedupeMatches(matches).map((m) => {
    const n = (counters[m.kind] = (counters[m.kind] ?? 0) + 1);
    let pseudonym: string;
    if (style === "token") pseudonym = `[${KIND_LABEL[m.kind]}_${n}]`;
    else if (style === "opaque")
      pseudonym = `⟦${hash(m.real).toString(16).padStart(8, "0").slice(0, 8)}⟧`;
    else pseudonym = fakeFor(m.real, m.kind);
    return { ...m, pseudonym };
  });
  return { entries };
}

/** real → pseudonym. A German inflection tail on the real value is consumed and
 *  re-attached to the pseudonym so the sentence still scans. */
export function sanitize(text: string, map: PiiMap, germanMorphology: boolean): string {
  const suffix = germanMorphology ? DE_SUFFIX : "";
  let out = text;
  for (const e of [...map.entries].sort((a, b) => b.real.length - a.real.length)) {
    const re = new RegExp(`${L}${escapeRe(e.real)}(${suffix})${R}`, "giu");
    out = out.replace(re, (_m, suf: string) => e.pseudonym + (suf || ""));
  }
  return out;
}

/** pseudonym → real. Handles a tail the model appended to the pseudonym
 *  ("Frau Schmidts" → "Frau Müllers"). */
export function desanitize(text: string, map: PiiMap, germanMorphology: boolean): string {
  const suffix = germanMorphology ? DE_SUFFIX : "";
  let out = text;
  for (const e of [...map.entries].sort((a, b) => b.pseudonym.length - a.pseudonym.length)) {
    const re = new RegExp(`${L}${escapeRe(e.pseudonym)}(${suffix})${R}`, "gu");
    out = out.replace(re, (_m, suf: string) => e.real + (suf || ""));
  }
  return out;
}

/** Real values still present in the text we would send to the model — a hard failure. */
export function auditLeaks(sent: string, map: PiiMap): string[] {
  return map.entries
    .filter((e) => new RegExp(`${L}${escapeRe(e.real)}${R}`, "iu").test(sent))
    .map((e) => e.real);
}

/** Pseudonyms still present after re-insertion — the user would see a placeholder. */
export function auditResidual(shown: string, map: PiiMap): string[] {
  return map.entries.filter((e) => shown.includes(e.pseudonym)).map((e) => e.pseudonym);
}
