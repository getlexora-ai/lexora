// Runs the corpus parser against the REAL src/lib/rag/corpus/*.md. No key.
//   node --test tests/library-parse.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  dewrap,
  extractQuotedVariants,
  firstStatuteRef,
  parseCuratedLibrary,
  parseModelClauses,
  parseTemplateClauses,
} from "../src/lib/library/parse-corpus.ts";
import { isKnownTopic } from "../src/lib/clause-taxonomy.ts";

test("dewrap: joins hard-wrapped lines, keeps paragraph breaks, drops soft hyphens", () => {
  assert.equal(dewrap("Der Mieter\nzahlt die\nMiete."), "Der Mieter zahlt die Miete.");
  assert.equal(dewrap("Absatz eins.\n\nAbsatz zwei."), "Absatz eins.\n\nAbsatz zwei.");
  assert.equal(dewrap("Betriebskosten­auf­stellung"), "Betriebskostenaufstellung");
});

test("firstStatuteRef: prefers a match naming a code; null when none", () => {
  assert.equal(firstStatuteRef("Kaution (§ 551 BGB)"), "§ 551 BGB");
  assert.equal(firstStatuteRef("… nach § 558 Abs. 3 BGB erhöhen"), "§ 558 Abs. 3 BGB");
  assert.equal(firstStatuteRef("no statute here"), null);
});

test("extractQuotedVariants: one span normally, two for the doc-18 shape", () => {
  assert.deepEqual(extractQuotedVariants('„Nur eine Klausel."'), ["Nur eine Klausel."]);
  const two = extractQuotedVariants('„Variante eins." — oder bei Befristung: „Variante zwei."');
  assert.equal(two.length, 2);
  assert.equal(two[0], "Variante eins.");
  assert.equal(two[1], "Variante zwei.");
});

test("parseModelClauses: 21 docs → 22 rows (doc 18 yields 2 variants)", () => {
  const rows = parseModelClauses();
  assert.equal(rows.length, 22);

  const doc18 = rows.filter((r) => r.doc_ref.startsWith("18-zeitmietvertrag-575"));
  assert.equal(doc18.length, 2);
  assert.equal(doc18[0].doc_ref, "18-zeitmietvertrag-575");
  assert.equal(doc18[1].doc_ref, "18-zeitmietvertrag-575#v2");
  assert.equal(doc18[0].posture, "preferred");
  assert.equal(doc18[1].posture, "fallback");
});

test("parseModelClauses: staffel/index seeded as fallback", () => {
  const rows = parseModelClauses();
  assert.equal(rows.find((r) => r.doc_ref === "07-staffelmiete-557a").posture, "fallback");
  assert.equal(rows.find((r) => r.doc_ref === "08-indexmiete-557b").posture, "fallback");
});

test("parseModelClauses: every row is well-formed", () => {
  for (const r of parseModelClauses()) {
    assert.ok(r.content.length > 20, `${r.doc_ref}: content too short`);
    assert.ok(!r.content.includes("„"), `${r.doc_ref}: opening quote not stripped`);
    assert.ok(!/\*\*/.test(r.content), `${r.doc_ref}: markdown bold not stripped`);
    assert.ok(!/\n[ \t]*[a-zäöüß]/.test(r.content) || r.content.includes("\n\n"),
      `${r.doc_ref}: looks hard-wrapped`);
    assert.ok(isKnownTopic(r.clause_type), `${r.doc_ref}: unknown topic ${r.clause_type}`);
    assert.ok(r.title.length > 0);
    assert.ok(Array.isArray(r.tags));
  }
});

test("parseModelClauses: doc 11 keeps its numeric limits after bold-stripping", () => {
  const row = parseModelClauses().find((r) => r.doc_ref === "11-kleinreparaturen");
  assert.match(row.content, /100 EUR je Einzelfall/);
  assert.match(row.content, /8 % der\s+Jahresnettokaltmiete|8 % der Jahresnettokaltmiete/);
});

test("parseTemplateClauses: exactly 11 §-clauses, paragraphs 1..11", () => {
  const rows = parseTemplateClauses();
  assert.equal(rows.length, 11);
  const refs = rows.map((r) => r.doc_ref);
  for (let p = 1; p <= 11; p++) {
    assert.ok(refs.includes(`22-vorlage#p${p}`), `missing 22-vorlage#p${p}`);
  }
  assert.ok(rows.every((r) => r.posture === "preferred"));
  assert.ok(rows.every((r) => isKnownTopic(r.clause_type)));
  // § 5 is the Kaution paragraph
  const p5 = rows.find((r) => r.doc_ref === "22-vorlage#p5");
  assert.equal(p5.clause_type, "kaution");
  assert.match(p5.title, /^§ 5 /);
});

test("parseCuratedLibrary: 33 rows, all doc_ref unique", () => {
  const rows = parseCuratedLibrary();
  assert.equal(rows.length, 33);
  assert.equal(new Set(rows.map((r) => r.doc_ref)).size, 33);
});
