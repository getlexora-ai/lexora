// Pure unit tests for the Germany-only narrowing + the English/German output
// axis. No network, no key — always runs.
//   node --test tests/germany-only.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { buildQueries, composeSystem } from "../src/lib/rag/generate.ts";
import { reviewPrompt, coerceIssues } from "../src/lib/analysis.ts";

// ── RAG: retrieval stays German, only the output language switches ──
test("buildQueries: sub-queries are German and independent of output language", () => {
  const base = { landlord: "A", tenant: "B", propertyAddress: "X", baseRentEur: 1000 };
  const de = buildQueries({ ...base, language: "de" });
  const en = buildQueries({ ...base, language: "en" });

  assert.deepEqual(de, en, "language must not change what we retrieve");
  assert.ok(de.length >= 6);
  assert.ok(de.some((q) => /§ 551 BGB/.test(q)), "grounding queries stay in German law");
  assert.ok(!de.some((q) => /english/i.test(q)));
});

test("composeSystem: 'de' is the bare German persona, 'en' appends the output-language instruction", () => {
  const de = composeSystem("de");
  const en = composeSystem("en");

  assert.equal(de, composeSystem(), "de is the default");
  assert.ok(de.startsWith("Du bist Fachanwalt"), "German persona preserved");
  assert.ok(!/OUTPUT LANGUAGE/.test(de));

  assert.ok(en.startsWith(de), "en keeps the full German persona, then extends it");
  assert.ok(/OUTPUT LANGUAGE: English/.test(en));
  assert.ok(/Write the residential lease contract in English/.test(en));
  assert.ok(/§ 551 BGB/.test(en), "German statutory citations are kept verbatim");
  assert.ok(/\(Kaution\)/.test(en), "German legal term kept in parentheses on first use");
});

// ── Analysis: always German law, language switches issue/suggestion text ──
test("reviewPrompt: German-law frame in both languages; language instruction differs", () => {
  const de = reviewPrompt("de");
  const en = reviewPrompt("en");

  for (const p of [de, en]) {
    assert.ok(/Fachanwalt/.test(p), "reviewer is a German Fachanwalt");
    assert.ok(/GERMAN LAW/.test(p));
    assert.ok(/§§ 305[–-]310 BGB/.test(p), "AGB-Kontrolle cited");
    assert.ok(/mietrechtliche Spezialnormen/.test(p));
    assert.ok(/MUST cite the relevant norm/.test(p), "each issue must cite a norm");
    assert.ok(/reference:/.test(p), "optional reference field is described");
  }

  assert.equal(reviewPrompt(), de, "de is the default");
  assert.ok(/in German \(Deutsch\)/.test(de));
  assert.ok(/in English/.test(en));
  assert.notEqual(de, en);
});

// ── coerceIssues: the optional `reference` field ──
test("coerceIssues: keeps `reference` when present, omits it when blank/missing", () => {
  const parsed = {
    issues: [
      {
        passage: "Starre Fristen für Schönheitsreparaturen",
        type: "high",
        clause: "§ 6 Schönheitsreparaturen",
        issue: "Starre Fristen — unwirksam (§ 307 BGB)",
        suggestion: "Der Mieter führt Schönheitsreparaturen nach Bedarf aus.",
        reference: "§ 307 BGB",
      },
      {
        passage: "Kaution in Höhe von vier Monatsmieten",
        type: "MEDIUM",
        clause: "§ 5 Kaution",
        issue: "Kaution übersteigt drei Nettokaltmieten",
        suggestion: "Die Kaution beträgt höchstens drei Nettokaltmieten.",
        reference: "   ",
      },
      {
        passage: "no clause here",
        type: "low",
        clause: "",
        issue: "missing clause title",
        suggestion: "irrelevant",
      },
    ],
  };

  const issues = coerceIssues(parsed);
  assert.equal(issues.length, 2, "the malformed third entry is dropped");

  assert.equal(issues[0].reference, "§ 307 BGB");
  assert.equal(issues[1].type, "medium", "type is lower-cased / coerced");
  assert.ok(!("reference" in issues[1]), "blank reference is omitted, not kept as ''");
});

test("coerceIssues: non-array / empty input yields []", () => {
  assert.deepEqual(coerceIssues(null), []);
  assert.deepEqual(coerceIssues({}), []);
  assert.deepEqual(coerceIssues({ issues: "nope" }), []);
});
