// Pure unit tests for the passage locator. No network, no key.
//   node --test tests/passage-match.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { findPassage, normalise } from "../src/lib/passage-match.ts";

const DOC =
  "§ 1 Term\n\nThis Agreement begins on the Effective Date and continues\nfor an initial period of two (2) years.\n\n§ 2 Fees\n\nThe Client shall pay the Fees within 30 days.";

test("exact match returns the literal offsets", () => {
  const r = findPassage(DOC, "the Effective Date");
  assert.ok(r);
  assert.equal(DOC.slice(r.start, r.end), "the Effective Date");
});

test("whitespace-insensitive match spans a newline in the source", () => {
  // needle uses single spaces; the doc wraps "continues\nfor"
  const r = findPassage(DOC, "continues for an initial period");
  assert.ok(r);
  assert.equal(normalise(DOC.slice(r.start, r.end)), "continues for an initial period");
});

test("case-insensitive fallback", () => {
  const r = findPassage(DOC, "the client shall pay the fees");
  assert.ok(r);
  assert.equal(DOC.slice(r.start, r.end), "The Client shall pay the Fees");
});

test("no match returns null", () => {
  assert.equal(findPassage(DOC, "indemnifies the Provider against all losses"), null);
});

test("empty needle returns null", () => {
  assert.equal(findPassage(DOC, ""), null);
});

test("first occurrence wins when the needle repeats", () => {
  const t = "pay the Fees. Later, pay the Fees again.";
  const r = findPassage(t, "pay the Fees");
  assert.deepEqual(r, { start: 0, end: 12 });
});
