// Parser for the dual-purpose Ask-AI reply (see src/app/api/contract-edit/route.ts).
//
// Pure — NO `@/` imports, relative only — so `node --test` can import it
// directly (same rule as src/lib/delta-text.ts).
//
// Each Ask-AI turn is either a QUESTION (the model answers it) or an
// INSTRUCTION to change the contract. For a change the model replies with
// EITHER a list of targeted find/replace edits (the normal case) OR, for a
// change that spans the whole document, a full rewrite:
//
//   ---MODE---
//   edit
//   ---ANSWER---
//   <1–3 sentence summary of what changed>
//   ---CHANGES---
//   [ { "find": "<verbatim snippet>", "replace": "<new text>", "note": "…" }, … ]
//
//   …or, for a structural change:
//
//   ---DOCUMENT---
//   <the COMPLETE updated contract in Markdown>
//
// This parser is deliberately forgiving: a reply that ignores the format is
// treated as a plain answer rather than throwing, unparseable CHANGES fall back
// to an answer, and an "edit" whose DOCUMENT is missing or implausibly short is
// downgraded — a malformed reply can never blank the user's contract.

export type EditChange = { find: string; replace: string; note?: string };

export type EditReply = {
  mode: "answer" | "edit";
  answer: string;
  /** Targeted edits — present only when `mode === "edit"` and at least one is valid. */
  changes?: EditChange[];
  /** Full rewrite — present only when `mode === "edit"` and no `changes`. */
  document?: string;
};

const MODE_RE     = /^-{2,}\s*MODE\s*-{2,}\s*$/im;
const ANSWER_RE   = /^-{2,}\s*ANSWER\s*-{2,}\s*$/im;
const CHANGES_RE  = /^-{2,}\s*CHANGES\s*-{2,}\s*$/im;
const DOCUMENT_RE = /^-{2,}\s*DOCUMENT\s*-{2,}\s*$/im;
// Legacy shape from before the answer/edit split: `<doc>---EXPLANATION---<expl>`.
const LEGACY_RE   = /^-{2,}\s*EXPLANATION\s*-{2,}\s*$/im;

/** Strip a single wrapping ``` / ```json / ```markdown fence, if fully fenced. */
function unfence(s: string): string {
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(s.trim());
  return m ? m[1].trim() : s.trim();
}

/** Slice `text` from just after `start` to the start of the earliest of `ends`. */
function section(text: string, start: RegExpMatchArray, ends: RegExpMatchArray[]): string {
  const from = (start.index ?? 0) + start[0].length;
  const to = ends
    .map((m) => m.index ?? -1)
    .filter((i) => i >= from)
    .reduce((min, i) => (min === -1 ? i : Math.min(min, i)), -1);
  return text.slice(from, to === -1 ? undefined : to).trim();
}

/** Parse + validate the CHANGES JSON array. Returns [] on anything unusable. */
function parseChanges(raw: string): EditChange[] {
  let json: unknown;
  try {
    json = JSON.parse(unfence(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const out: EditChange[] = [];
  for (const item of json) {
    if (
      item && typeof item === "object" &&
      typeof (item as EditChange).find === "string" &&
      typeof (item as EditChange).replace === "string" &&
      (item as EditChange).find.length > 0 &&
      (item as EditChange).find !== (item as EditChange).replace
    ) {
      const c = item as EditChange;
      out.push({ find: c.find, replace: c.replace, ...(typeof c.note === "string" ? { note: c.note } : {}) });
    }
  }
  return out;
}

/**
 * @param prevLength length of the contract that was sent to the model; a
 *        full-rewrite whose returned document is shorter than half of it is
 *        assumed truncated / bogus and is downgraded to an answer.
 */
export function parseEditReply(raw: string, prevLength = 0): EditReply {
  const text = (raw ?? "").trim();
  if (!text) return { mode: "answer", answer: "" };

  const answerM  = text.match(ANSWER_RE);
  const changesM = text.match(CHANGES_RE);
  const docM     = text.match(DOCUMENT_RE);
  const modeM    = text.match(MODE_RE);

  if (answerM) {
    const laterMarkers = [changesM, docM].filter(Boolean) as RegExpMatchArray[];
    const modeRaw = modeM
      ? section(text, modeM, [answerM, ...laterMarkers])
      : "";
    const answer = section(text, answerM, laterMarkers) || text;
    const wantsEdit = /edit/i.test(modeRaw) || (!modeM && (!!changesM || !!docM));

    // Targeted edits win over a full rewrite if the model somehow sent both.
    if (wantsEdit && changesM) {
      const changesRaw = section(text, changesM, docM ? [docM] : []);
      const changes = parseChanges(changesRaw);
      if (changes.length) return { mode: "edit", answer: answer, changes };
    }

    if (wantsEdit && docM) {
      const document = unfence(text.slice((docM.index ?? 0) + docM[0].length));
      if (document.length >= Math.max(40, prevLength * 0.5)) {
        return { mode: "edit", answer: answer || "Contract updated.", document };
      }
    }

    return { mode: "answer", answer };
  }

  // Legacy `<doc>---EXPLANATION---<expl>` shape.
  const legacyM = text.match(LEGACY_RE);
  if (legacyM) {
    const document = unfence(text.slice(0, legacyM.index));
    const answer = text.slice((legacyM.index ?? 0) + legacyM[0].length).trim() || "Contract updated.";
    if (document.length >= Math.max(40, prevLength * 0.5)) {
      return { mode: "edit", answer, document };
    }
    return { mode: "answer", answer };
  }

  return { mode: "answer", answer: text };
}
