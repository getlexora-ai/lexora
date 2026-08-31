// Pure unit tests for the guardrail engine. No network, no key — always runs.
//   node --test tests/guardrails.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGuardrails, formatGuardrailsForPrompt, tierFor } from "../src/lib/guardrails/index.ts";

const LEASE = "Lease Agreement";

// A clean lease that should pass every hard guardrail.
const OK_LEASE = `# Wohnraummietvertrag

## § 1 Mietobjekt
Vermietet wird die 3-Zimmer-Wohnung in der Musterstraße 12, 10115 Berlin.

## § 3 Miete und Zahlung
Die Nettokaltmiete beträgt 1.000,00 EUR monatlich.

## § 4 Betriebskosten
Über die Betriebskosten wird jährlich, spätestens nach zwölf Monaten, abgerechnet.

## § 5 Kaution
Der Mieter leistet eine Kaution in Höhe von 3.000,00 EUR (drei Nettokaltmieten).

## § 6 Schönheitsreparaturen
Der Mieter führt Schönheitsreparaturen nach Bedarf aus.

## § 7 Kleinreparaturen
Kleinreparaturen trägt der Mieter bis 100,00 EUR je Einzelfall, höchstens 8 % der Jahresmiete.

## § 10 Kündigung
Die Kündigungsfrist richtet sich nach § 573c BGB.
`;

test("clean lease passes every hard guardrail", () => {
  const r = evaluateGuardrails({ contractText: OK_LEASE, contractType: LEASE });
  assert.equal(r.ok, true);
  assert.equal(r.hardFailures.length, 0);
  assert.ok(r.findings.length >= 5);
  assert.equal(formatGuardrailsForPrompt(r), "");
});

test("deposit-cap violation via structured fields", () => {
  const r = evaluateGuardrails({
    contractText: "## § 1 Mietobjekt\nVermietet wird die Wohnung Musterstraße 1.\n## § 3 Miete\nDie Nettokaltmiete beträgt 1.000 EUR.\n## § 5 Kaution\nSiehe Anlage.",
    contractType: LEASE,
    fields: { baseRentEur: 1000, depositEur: 3500 },
  });
  const kaution = r.findings.find((f) => f.topic === "kaution");
  assert.equal(kaution.status, "violation");
  assert.equal(kaution.tier, "guardrail");
  assert.ok(r.hardFailures.some((f) => f.topic === "kaution"));
  assert.equal(r.ok, false);
  assert.match(kaution.reference, /§ 551/);
});

test("deposit-cap OK via structured fields", () => {
  const r = evaluateGuardrails({
    contractText: "## § 5 Kaution\nSiehe Anlage.",
    contractType: LEASE,
    fields: { baseRentEur: 1000, depositEur: 3000 },
  });
  const kaution = r.findings.find((f) => f.topic === "kaution");
  assert.equal(kaution.status, "ok");
  assert.ok(!r.hardFailures.some((f) => f.topic === "kaution"));
});

test("deposit-cap violation parsed from contract text with no fields", () => {
  const text = `## § 5 Kaution
Die Kaution beträgt 4.000,00 EUR.

## § 3 Miete
Die Nettokaltmiete beträgt 1.000,00 EUR monatlich.`;
  const r = evaluateGuardrails({ contractText: text, contractType: LEASE });
  const kaution = r.findings.find((f) => f.topic === "kaution");
  assert.equal(kaution.status, "violation");
  assert.ok(r.hardFailures.some((f) => f.topic === "kaution"));
});

test("missing mandatory topic is a hard failure", () => {
  const r = evaluateGuardrails({
    contractText: "## § 3 Miete\nDie Nettokaltmiete beträgt 1.000,00 EUR.",
    contractType: LEASE,
  });
  const mietobjekt = r.findings.find((f) => f.topic === "mietobjekt");
  assert.equal(mietobjekt.status, "missing");
  assert.equal(mietobjekt.tier, "guardrail");
  assert.ok(r.hardFailures.some((f) => f.topic === "mietobjekt"));
  assert.equal(r.ok, false);
});

test("a present mandatory topic passes its presence check", () => {
  const r = evaluateGuardrails({
    contractText: "## § 1 Mietobjekt\nVermietet wird die Wohnung in der Musterstraße 1, 10115 Berlin.\n## § 3 Miete\nDie Nettokaltmiete beträgt 1.000 EUR.",
    contractType: LEASE,
  });
  const mietobjekt = r.findings.find((f) => f.topic === "mietobjekt");
  assert.equal(mietobjekt.status, "ok");
});

test("forbidden pattern hit produces a violation (soft, important tier)", () => {
  const text = `## § 1 Mietobjekt
Vermietet wird die Wohnung in der Musterstraße 1, 10115 Berlin.
## § 3 Miete
Die Nettokaltmiete beträgt 1.000,00 EUR.
## § 6 Schönheitsreparaturen
Es gelten starre Fristen: der Mieter renoviert spätestens alle 3 Jahre.`;
  const r = evaluateGuardrails({ contractText: text, contractType: LEASE });
  const sr = r.findings.find((f) => f.topic === "schoenheitsreparaturen");
  assert.equal(sr.status, "violation");
  assert.equal(sr.tier, "important");
  assert.ok(r.softFlags.some((f) => f.topic === "schoenheitsreparaturen"));
  // no hard guardrail broken here → still "ok"
  assert.equal(r.ok, true);
  const block = formatGuardrailsForPrompt(r);
  assert.match(block, /HINWEISE:/);
  assert.match(block, /Schönheitsreparaturen/);
});

test("unknown / non-lease contract type → empty report, ok", () => {
  const r = evaluateGuardrails({ contractText: "Some NDA text.", contractType: "Non-Disclosure Agreement" });
  assert.equal(r.findings.length, 0);
  assert.equal(r.hardFailures.length, 0);
  assert.equal(r.ok, true);
  assert.equal(formatGuardrailsForPrompt(r), "");
});

test("formatGuardrailsForPrompt shape for a hard failure", () => {
  const r = evaluateGuardrails({
    contractText: "## § 3 Miete\nDie Nettokaltmiete beträgt 1.000,00 EUR.",
    contractType: LEASE,
  });
  const block = formatGuardrailsForPrompt(r);
  assert.match(block, /GUARDRAIL-VERSTÖSSE/);
  assert.match(block, /- \[/);
});

test("tierFor maps known topics and defaults to optional", () => {
  assert.equal(tierFor("kaution"), "guardrail");
  assert.equal(tierFor("betriebskosten"), "important");
  assert.equal(tierFor("datenschutz"), "optional");
  assert.equal(tierFor("does-not-exist"), "optional");
});
