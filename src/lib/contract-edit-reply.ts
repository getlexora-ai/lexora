// Parser for the dual-purpose Ask-AI reply (see src/app/api/contract-edit/route.ts).
//
// Pure — NO `@/` imports, relative only — so `node --test` can import it
// directly (same rule as src/lib/delta-text.ts).
//
// Each Ask-AI turn is either a QUESTION (the model answers it) or an
// INSTRUCTION to change the contract (the model rewrites it). The model is told
// to reply in this shape:
//
//   ---MODE---
//   answer            (or: edit)
//   ---ANSWER---
//   <the answer, or a 1–3 sentence summary of what changed>
//   ---DOCUMENT---
//   <the COMPLETE updated contract in Markdown — only when MODE is edit>
//
// This parser is deliberately forgiving: a reply that ignores the format is
// treated as a plain answer rather than throwing, and an "edit" whose document
// is missing or implausibly short is downgraded to "answer" so a malformed
// reply can never blank the user's contract.

export type EditReply = {
  mode: "answer" | "edit";
  answer: string;
  /** Present only when `mode === "edit"` and a plausible document was returned. */
  document?: string;
};

const MODE_RE     = /^-{2,}\s*MODE\s*-{2,}\s*$/im;
const ANSWER_RE   = /^-{2,}\s*ANSWER\s*-{2,}\s*$/im;
const DOCUMENT_RE  = /^-{2,}\s*DOCUMENT\s*-{2,}\s*$/im;
// Legacy shape from before the answer/edit split: `<doc>---EXPLANATION---<expl>`.
const LEGACY_RE   = /^-{2,}\s*EXPLANATION\s*-{2,}\s*$/im;

/** Strip a single wrapping ``` / ```markdown fence, if the whole string is fenced. */
function unfence(s: string): string {
  const m = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(s.trim());
  return m ? m[1].trim() : s.trim();
}

/** Slice `text` from just after `start`'s match to the start of the earliest of `ends`. */
function section(text: string, start: RegExpMatchArray, ends: RegExpMatchArray[]): string {
  const from = (start.index ?? 0) + start[0].length;
  const to = ends
    .map((m) => m.index ?? -1)
    .filter((i) => i >= from)
    .reduce((min, i) => (min === -1 ? i : Math.min(min, i)), -1);
  return text.slice(from, to === -1 ? undefined : to).trim();
}

/**
 * @param prevLength length of the contract that was sent to the model; an
 *        "edit" whose returned document is shorter than half of it is assumed
 *        truncated / bogus and is downgraded to an answer.
 */
export function parseEditReply(raw: string, prevLength = 0): EditReply {
  const text = (raw ?? "").trim();
  if (!text) return { mode: "answer", answer: "" };

  const answerM = text.match(ANSWER_RE);
  const docM    = text.match(DOCUMENT_RE);
  const modeM   = text.match(MODE_RE);

  // Well-formed: an ---ANSWER--- marker is present.
  if (answerM) {
    const modeRaw = modeM ? section(text, modeM, [answerM, docM].filter(Boolean) as RegExpMatchArray[]) : "";
    const answer  = section(text, answerM, docM ? [docM] : []);
    const document = docM ? unfence(text.slice((docM.index ?? 0) + docM[0].length)) : "";

    const wantsEdit = /edit/i.test(modeRaw) || (!modeM && !!document);
    if (wantsEdit && document && document.length >= Math.max(40, prevLength * 0.5)) {
      return { mode: "edit", answer: answer || "Contract updated.", document };
    }
    return { mode: "answer", answer: answer || text };
  }

  // Legacy `<doc>---EXPLANATION---<expl>` shape.
  const legacyM = text.match(LEGACY_RE);
  if (legacyM) {
    const document = unfence(text.slice(0, legacyM.index));
    const answer   = text.slice((legacyM.index ?? 0) + legacyM[0].length).trim() || "Contract updated.";
    if (document.length >= Math.max(40, prevLength * 0.5)) {
      return { mode: "edit", answer, document };
    }
    return { mode: "answer", answer };
  }

  // No recognisable structure — it's just an answer.
  return { mode: "answer", answer: text };
}
