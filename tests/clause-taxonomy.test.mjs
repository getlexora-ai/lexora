// Pure unit tests for the shared clause taxonomy. No network, no key.
//   node --test tests/clause-taxonomy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAUSE_TOPICS,
  DOC_TO_TOPIC,
  DOCS_WITHOUT_MODEL_CLAUSE,
  FALLBACK_TOPIC,
  getTopic,
  guessTopic,
  isKnownTopic,
  topicForParagraph,
  topicLabel,
} from "../src/lib/clause-taxonomy.ts";
import { loadCorpus } from "../src/lib/rag/corpus.ts";

test("topic keys are unique", () => {
  const keys = CLAUSE_TOPICS.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lease paragraph numbers are 1..11, unique and contiguous", () => {
  const paras = CLAUSE_TOPICS.filter((t) => t.lease && t.para != null)
    .map((t) => t.para)
    .sort((a, b) => a - b);
  assert.deepEqual(paras, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("topicForParagraph round-trips every numbered lease topic", () => {
  for (const t of CLAUSE_TOPICS) {
    if (t.lease && t.para != null) {
      assert.equal(topicForParagraph(t.para), t.key);
    }
  }
  assert.equal(topicForParagraph(99), undefined);
});

test("topicLabel: de/en, falls back to the key for an unknown topic", () => {
  assert.equal(topicLabel("kaution", "de"), "Kaution");
  assert.equal(topicLabel("kaution", "en"), "Security deposit");
  assert.equal(topicLabel("kaution"), "Kaution", "de is the default");
  assert.equal(topicLabel("does-not-exist"), "does-not-exist");
});

test("isKnownTopic / getTopic", () => {
  assert.ok(isKnownTopic("mietobjekt"));
  assert.ok(!isKnownTopic("nope"));
  assert.equal(getTopic("mietobjekt")?.para, 1);
  assert.equal(getTopic("nope"), undefined);
});

test("guessTopic maps common titles; unknown → sonstiges", () => {
  assert.equal(guessTopic("§ 5 Kaution"), "kaution");
  assert.equal(guessTopic("Clause 3: Limitation of Liability"), "haftung");
  assert.equal(guessTopic("§ 6 Schönheitsreparaturen"), "schoenheitsreparaturen");
  assert.equal(guessTopic("Betriebskostenabrechnung"), "betriebskosten");
  assert.equal(guessTopic("Ordentliche Kündigung des Vermieters"), "kuendigung");
  assert.equal(guessTopic("Confidentiality & Non-Disclosure"), "vertraulichkeit");
  assert.equal(guessTopic("Governing Law and Jurisdiction"), "rechtswahl");
  assert.equal(guessTopic("§ 1 Mietobjekt"), "mietobjekt");
  assert.equal(guessTopic(""), FALLBACK_TOPIC);
  assert.equal(guessTopic(null), FALLBACK_TOPIC);
  assert.equal(guessTopic("A totally unrelated heading"), FALLBACK_TOPIC);
});

test("DOC_TO_TOPIC: every value is a known topic", () => {
  for (const [doc, topic] of Object.entries(DOC_TO_TOPIC)) {
    assert.ok(isKnownTopic(topic), `${doc} → unknown topic "${topic}"`);
  }
});

test("DOC_TO_TOPIC covers every corpus doc that has a model clause", () => {
  const docs = loadCorpus().map((d) => d.id);
  for (const id of docs) {
    if (DOCS_WITHOUT_MODEL_CLAUSE.has(id)) {
      assert.ok(!(id in DOC_TO_TOPIC), `${id} should not be mapped`);
      continue;
    }
    assert.ok(id in DOC_TO_TOPIC, `corpus doc ${id} is not in DOC_TO_TOPIC`);
  }
  // and nothing stale in the map
  for (const id of Object.keys(DOC_TO_TOPIC)) {
    assert.ok(docs.includes(id), `DOC_TO_TOPIC has "${id}" which is not a corpus doc`);
  }
});
