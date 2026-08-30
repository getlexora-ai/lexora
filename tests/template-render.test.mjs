// Pure unit tests for the template renderer. No network, no key.
//   node --test tests/template-render.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  renderTemplate,
  formatEur,
  evalExpr,
  computeDerived,
} from "../src/lib/templates/render.ts";

test("substitutes {{key}} from values", () => {
  const { text, missing } = renderTemplate(
    "Die Wohnung {{propertyAddress}} mit {{rooms}} Zimmern.",
    { propertyAddress: "Musterstr. 1, Berlin", rooms: 3 },
  );
  assert.equal(text, "Die Wohnung Musterstr. 1, Berlin mit 3 Zimmern.");
  assert.deepEqual(missing, []);
});

test("tolerates whitespace inside the braces", () => {
  const { text } = renderTemplate("Miete {{ baseRentEur }} EUR", { baseRentEur: 1200 });
  assert.equal(text, "Miete 1200 EUR");
});

test("leaves an unknown key verbatim — never blanks it", () => {
  const { text, missing } = renderTemplate(
    "Konto {{iban}} — Schlüssel {{ keys }}.",
    {},
  );
  assert.equal(text, "Konto {{iban}} — Schlüssel {{ keys }}.");
  assert.deepEqual(missing, []);
});

test("reports a required key that has no value (and still leaves it verbatim)", () => {
  const { text, missing } = renderTemplate(
    "Beginn: {{startDate}}. Miete: {{baseRentEur}}.",
    { baseRentEur: 1000 },
    { variables: [{ key: "startDate", required: true }, { key: "baseRentEur", required: true }] },
  );
  assert.deepEqual(missing, ["startDate"]);
  assert.match(text, /Beginn: \{\{startDate\}\}\./);
  assert.match(text, /Miete: 1000\./);
});

test("evaluates a derived variable with + - * /", () => {
  const { text } = renderTemplate(
    "Gesamtmiete {{totalRentEur}} EUR",
    { baseRentEur: 1200, operatingCostsEur: 250 },
    { variables: [{ key: "totalRentEur", type: "derived", expr: "baseRentEur + operatingCostsEur" }] },
  );
  assert.equal(text, "Gesamtmiete 1450 EUR");

  assert.equal(evalExpr("(a - b) * 2 / 4", (n) => ({ a: 10, b: 2 })[n]), 4);
});

test("derived expr rejects anything outside the whitelist", () => {
  const bad = ["baseRent ** 2", "process.exit()", "a; b", "a && b", "[1,2]", "`x`", "a % b"];
  for (const expr of bad) {
    assert.throws(() => evalExpr(expr, () => 1), /derived expr/, `expected throw for: ${expr}`);
  }
  // a plain variable reference and arithmetic are fine
  assert.equal(evalExpr("a + b * 2", (n) => ({ a: 1, b: 3 })[n]), 7);
});

test("computeDerived: an explicit value wins over the formula", () => {
  const d = computeDerived(
    [{ key: "totalRentEur", type: "derived", expr: "a + b" }],
    { a: 1, b: 2, totalRentEur: 99 },
  );
  assert.deepEqual(d, {});
});

test("formatEur: de-DE currency formatting", () => {
  assert.equal(formatEur(1200), "1.200,00 EUR");
  assert.equal(formatEur(1234567.5), "1.234.567,50 EUR");
  assert.equal(formatEur(0), "0,00 EUR");
  assert.equal(formatEur(-50), "-50,00 EUR");
});

test("section markers: disabled/absent section drops its line, enabled keeps it", () => {
  const body = [
    "Immer sichtbar.",
    "{{section:pets}}Haustiere sind gestattet.",
    "{{section:garden}}Gartenanteil mitvermietet.",
    "Ende.",
  ].join("\n");
  const { text } = renderTemplate(body, {}, {
    sections: [{ key: "pets", enabled: true }, { key: "garden", enabled: false }],
  });
  assert.equal(text, ["Immer sichtbar.", "Haustiere sind gestattet.", "Ende."].join("\n"));
});
