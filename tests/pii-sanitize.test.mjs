// Pure unit tests for the PII pseudonymisation core (issue #3 playground).
//   node --test tests/pii-sanitize.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { dictionaryMatches, patternMatches } from "../src/lib/pii/detect.ts";
import { fakeFor } from "../src/lib/pii/pseudonyms.ts";
import {
  buildMap,
  collectMatches,
  dedupeMatches,
  sanitize,
  desanitize,
  auditLeaks,
  auditResidual,
} from "../src/lib/pii/index.ts";

const KNOWN = [
  { value: "Anna Müller", kind: "name" },
  { value: "Müller", kind: "name" },
  { value: "Hauptstraße 14, 80331 München", kind: "address" },
];

test("dictionaryMatches: exact hit, longest known value wins the span", () => {
  const m = dictionaryMatches("Frau Anna Müller wohnt in München.", KNOWN, false);
  assert.equal(m[0].real, "Anna Müller");
  assert.equal(m[0].layer, "dictionary");
});

test("dictionaryMatches: German inflection tolerance catches the genitive", () => {
  const off = dictionaryMatches("die Wohnung Anna Müllers", KNOWN, false);
  assert.equal(off.length, 0, "without tolerance, `Müllers` is not `Anna Müller`");

  const on = dictionaryMatches("die Wohnung Anna Müllers", KNOWN, true);
  assert.equal(on[0].real, "Anna Müllers");
});

test("dictionaryMatches: word-boundary — no match inside a longer word", () => {
  const m = dictionaryMatches("Die Mieterhöhung betrifft Müller nicht.", [{ value: "Miete", kind: "other" }], true);
  assert.equal(m.length, 0);
});

test("patternMatches: email, IBAN, keyworded tax-id, phone, date", () => {
  const text =
    "Mail a.b@gmx.de, IBAN DE89 3704 0044 0532 0130 00, Steuer-ID 12345678901, " +
    "Tel. +49 170 2233445, ab 01.09.2026.";
  const kinds = patternMatches(text).map((m) => m.kind);
  for (const k of ["email", "iban", "tax-id", "phone", "date"]) {
    assert.ok(kinds.includes(k), `expected a ${k} match`);
  }
  const tax = patternMatches(text).find((m) => m.kind === "tax-id");
  assert.equal(tax.real, "12345678901", "tax-id captures the number, not the keyword");
});

test("dedupeMatches: first layer wins; a value inside a longer one is dropped", () => {
  const deduped = dedupeMatches([
    { real: "Anna Müller", kind: "name", layer: "dictionary" },
    { real: "Müller", kind: "name", layer: "patterns" },
    { real: "Anna Müller", kind: "name", layer: "llm-scan" },
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].real, "Anna Müller");
  assert.equal(deduped[0].layer, "dictionary");
});

test("buildMap: token style numbers per kind; fake style is deterministic", () => {
  const matches = [
    { real: "Anna Müller", kind: "name", layer: "dictionary" },
    { real: "Ben Klaus", kind: "name", layer: "dictionary" },
    { real: "a.b@gmx.de", kind: "email", layer: "patterns" },
  ];
  const tok = buildMap(matches, "token").entries.map((e) => e.pseudonym);
  assert.deepEqual(tok, ["[NAME_1]", "[NAME_2]", "[EMAIL_1]"]); // source order preserved

  const a = buildMap(matches, "fake").entries[0].pseudonym;
  const b = buildMap(matches, "fake").entries[0].pseudonym;
  assert.equal(a, b);
  assert.notEqual(a, "Anna Müller");
});

test("sanitize → desanitize round-trips an unchanged reply (fake style)", () => {
  const text = "Vermieter ist Anna Müller, Anschrift Hauptstraße 14, 80331 München.";
  const map = buildMap(collectMatches(text, {
    knownValues: KNOWN, useDictionary: true, usePatterns: true, germanMorphology: true,
  }), "fake");

  const sent = sanitize(text, map, true);
  assert.ok(!sent.includes("Anna Müller"));
  assert.ok(!sent.includes("Hauptstraße 14"));
  assert.equal(auditLeaks(sent, map).length, 0);

  const shown = desanitize(sent, map, true);
  assert.equal(shown, text);
  assert.equal(auditResidual(shown, map).length, 0);
});

test("desanitize: a suffix the model appended to the pseudonym is carried back", () => {
  const map = { entries: [{ real: "Anna Müller", kind: "name", layer: "dictionary", pseudonym: "Ben Klein" }] };
  const reply = "Die Wohnung Ben Kleins ist vermietet.";
  assert.equal(desanitize(reply, map, true), "Die Wohnung Anna Müllers ist vermietet.");
});

test("auditLeaks: flags a real value left in the payload", () => {
  const map = { entries: [{ real: "Anna Müller", kind: "name", layer: "dictionary", pseudonym: "Ben Klein" }] };
  assert.deepEqual(auditLeaks("… von Anna Müller unterschrieben", map), ["Anna Müller"]);
  assert.deepEqual(auditLeaks("… von Ben Klein unterschrieben", map), []);
});

test("token/opaque styles fully round-trip too", () => {
  const text = "Mieter: Anna Müller. Kontakt a.b@gmx.de.";
  for (const style of ["token", "opaque"]) {
    const map = buildMap(collectMatches(text, {
      knownValues: KNOWN, useDictionary: true, usePatterns: true, germanMorphology: true,
    }), style);
    const sent = sanitize(text, map, true);
    assert.equal(auditLeaks(sent, map).length, 0, `${style}: no leak`);
    assert.equal(desanitize(sent, map, true), text, `${style}: round-trips`);
  }
});

test("fakeFor: same kind shape, stable per value", () => {
  assert.match(fakeFor("x", "iban"), /^DE\d{2} /);
  assert.match(fakeFor("x", "email"), /@example\.de$/);
  assert.match(fakeFor("x", "date"), /^\d{2}\.\d{2}\.\d{4}$/);
  assert.equal(fakeFor("Klaus Bergmann", "name"), fakeFor("Klaus Bergmann", "name"));
});
