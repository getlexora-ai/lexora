// Pure unit tests for the Ask-AI reply parser. No network, no key.
//   node --test tests/contract-edit-reply.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { parseEditReply } from "../src/lib/contract-edit-reply.ts";

const DOC = "# Master Services Agreement\n\n## § 1 Term\n\nThis Agreement begins on the Effective Date and continues for two years.\n\n## § 2 Fees\n\nThe Client shall pay the Fees set out in Schedule 1.";

test("edit: targeted CHANGES array is parsed", () => {
  const raw = `---MODE---
edit
---ANSWER---
Renamed the Supplier to the Provider and fixed the cap.
---CHANGES---
[
  { "find": "the Supplier shall indemnify", "replace": "the Provider shall indemnify", "note": "rename" },
  { "find": "capped at the fees paid", "replace": "capped at 12 months' fees" }
]`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.changes.length, 2);
  assert.equal(r.changes[0].find, "the Supplier shall indemnify");
  assert.equal(r.changes[0].note, "rename");
  assert.equal(r.changes[1].note, undefined);
  assert.equal(r.document, undefined);
});

test("edit: CHANGES wrapped in a ```json fence still parses", () => {
  const raw = `---MODE---
edit
---ANSWER---
Deleted the trailing sentence.
---CHANGES---
\`\`\`json
[{ "find": " This clause is intentionally left blank.", "replace": "" }]
\`\`\``;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].replace, "");
});

test("edit: invalid CHANGES entries are dropped; all-invalid → answer", () => {
  const raw = `---MODE---
edit
---ANSWER---
tried
---CHANGES---
[ { "find": "x" }, { "replace": "y" }, { "find": "same", "replace": "same" }, 42 ]`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
  assert.equal(r.changes, undefined);
});

test("edit: unparseable CHANGES JSON → falls back to answer", () => {
  const raw = `---MODE---
edit
---ANSWER---
Here is what I would change.
---CHANGES---
- find "the term" and make it three years`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
  assert.match(r.answer, /what I would change/);
});

test("edit: CHANGES wins when the model sends both CHANGES and DOCUMENT", () => {
  const raw = `---MODE---
edit
---ANSWER---
Bumped the notice period.
---CHANGES---
[{ "find": "30 days", "replace": "60 days" }]
---DOCUMENT---
${DOC}`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.changes.length, 1);
  assert.equal(r.document, undefined);
});

test("edit: well-formed MODE/ANSWER/DOCUMENT → applies", () => {
  const raw = `---MODE---
edit
---ANSWER---
Renumbered the sections and tightened the heading case.
---DOCUMENT---
${DOC}`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.answer, "Renumbered the sections and tightened the heading case.");
  assert.equal(r.document, DOC);
});

test("answer: MODE answer with no DOCUMENT → question reply, no edit", () => {
  const raw = `---MODE---
answer
---ANSWER---
Your termination rights are in § 8: either party may terminate for material breach on 30 days' notice.`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
  assert.match(r.answer, /termination rights are in § 8/);
  assert.equal(r.document, undefined);
});

test("edit: DOCUMENT wrapped in a ```markdown fence is unwrapped", () => {
  const raw = `---MODE---
edit
---ANSWER---
Reformatted.
---DOCUMENT---
\`\`\`markdown
${DOC}
\`\`\``;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.document, DOC);
});

test("safety: MODE edit but DOCUMENT far shorter than the original → downgraded to answer", () => {
  const raw = `---MODE---
edit
---ANSWER---
Done.
---DOCUMENT---
# Master Services Agreement`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
  assert.equal(r.document, undefined);
});

test("safety: MODE edit with an empty DOCUMENT → answer, never a blank contract", () => {
  const raw = `---MODE---
edit
---ANSWER---
I couldn't produce the change.
---DOCUMENT---
`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
});

test("forgiving: plain prose with no separators → answer verbatim", () => {
  const raw = "The auto-renewal clause is standard for SaaS agreements in Germany.";
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "answer");
  assert.equal(r.answer, raw);
});

test("forgiving: ANSWER + DOCUMENT present but MODE line missing → treated as edit", () => {
  const raw = `---ANSWER---
Split § 2 into fees and payment terms.
---DOCUMENT---
${DOC}\n\n## § 3 Payment\n\nInvoices are due within 14 days.`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.match(r.document, /§ 3 Payment/);
});

test("legacy: <doc>---EXPLANATION---<expl> shape still parses as an edit", () => {
  const raw = `${DOC}
---EXPLANATION---
Corrected the term length to three years.`;
  const r = parseEditReply(raw, DOC.length);
  assert.equal(r.mode, "edit");
  assert.equal(r.document, DOC);
  assert.match(r.answer, /three years/);
});

test("empty input → empty answer, no throw", () => {
  const r = parseEditReply("", 0);
  assert.equal(r.mode, "answer");
  assert.equal(r.answer, "");
});

test("prevLength 0 (no baseline) still accepts a reasonable document", () => {
  const raw = `---MODE---
edit
---ANSWER---
Added a governing-law clause.
---DOCUMENT---
${DOC}\n\n## § 3 Governing law\n\nThis Agreement is governed by the laws of Germany.`;
  const r = parseEditReply(raw, 0);
  assert.equal(r.mode, "edit");
  assert.match(r.document, /Governing law/);
});
