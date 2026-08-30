// Pure unit tests for the clause-library re-rank helper.
//   node --test tests/clause-rank.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { cosine, rankClauses } from "../src/lib/library/rank.ts";

test("cosine: dot product of L2-normalised vectors; throws on dimension mismatch", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.throws(() => cosine([1, 0, 0], [1, 0]), /dimension mismatch/);
});

const base = (over) => ({
  id: "x",
  score: 0.8,
  clause_type: "kaution",
  posture: "preferred",
  is_approved: false,
  ...over,
});

test("exact-topic hit outranks an equal-cosine cross-topic hit", () => {
  const out = rankClauses(
    [
      base({ id: "same", clause_type: "kaution" }),
      base({ id: "other", clause_type: "betriebskosten" }),
    ],
    "kaution",
  );
  assert.equal(out[0].id, "same");
});

test("walk_away posture is demoted below an otherwise-equal row", () => {
  const out = rankClauses(
    [
      base({ id: "walk", posture: "walk_away" }),
      base({ id: "pref", posture: "preferred" }),
    ],
    null,
  );
  assert.equal(out[0].id, "pref");
  assert.ok(out.find((c) => c.id === "walk"));
});

test("unapproved rows are kept, but sort after an approved row of equal score", () => {
  const out = rankClauses(
    [
      base({ id: "unapproved", is_approved: false }),
      base({ id: "approved", is_approved: true }),
    ],
    null,
  );
  assert.equal(out[0].id, "approved");
  assert.equal(out.length, 2, "the unapproved row is not filtered out");
});

test("a clearly higher cosine still wins over the topic bonus", () => {
  const out = rankClauses(
    [
      base({ id: "farTopicMatch", score: 0.60, clause_type: "kaution" }),
      base({ id: "closeOffTopic", score: 0.95, clause_type: "miete" }),
    ],
    "kaution",
  );
  assert.equal(out[0].id, "closeOffTopic");
});
