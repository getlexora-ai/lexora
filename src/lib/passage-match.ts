// Locate a passage of text inside the editor's plain-text content.
//
// Pure — NO `@/` imports, relative only — so `node --test` can import it
// directly (same rule as src/lib/delta-text.ts).
//
// Used wherever the app has to turn a quoted snippet back into a character
// range in the live Quill document: applying a clause fix (`handleReplace`),
// highlighting the active clause, and applying an AI targeted edit
// (`applyChanges`). The AI and the analysis model both quote text that has been
// through a Markdown / whitespace round-trip, so an exact `indexOf` often
// misses by a run of spaces or a newline — hence the whitespace-insensitive
// fallback.

export type Range = { start: number; end: number };

/** Collapse every whitespace run to a single space; trim; lower-case. */
export function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * First occurrence of `needle` in `text`. Tries an exact match, then a
 * whitespace- and case-insensitive match whose result is mapped back to real
 * offsets in `text`. Returns null if neither hits.
 */
export function findPassage(text: string, needle: string): Range | null {
  if (!needle) return null;

  const exact = text.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  const normNeedle = normalise(needle);
  if (!normNeedle) return null;
  const normText = normalise(text);
  const normIdx = normText.indexOf(normNeedle);
  if (normIdx === -1) return null;

  // Walk `text`, counting normalised characters, to find where `normIdx` lands.
  let origIdx = 0;
  let normCount = 0;
  while (origIdx < text.length && normCount < normIdx) {
    if (/\s/.test(text[origIdx])) {
      while (origIdx < text.length && /\s/.test(text[origIdx])) origIdx++;
      normCount++;
    } else {
      origIdx++;
      normCount++;
    }
  }
  const start = origIdx;

  let normLen = 0;
  while (origIdx < text.length && normLen < normNeedle.length) {
    if (/\s/.test(text[origIdx])) {
      while (origIdx < text.length && /\s/.test(text[origIdx])) origIdx++;
      normLen++;
    } else {
      origIdx++;
      normLen++;
    }
  }

  return { start, end: origIdx };
}
