// Retrieval smoke test against the local vector index.
// Needs GEMINI_API_KEY (from .env.local) to embed the query, and a built index
// at data/rag/de-rental-index.json. Skips cleanly when either is missing.
//   node scripts/rag-ingest.mjs        # build the index first
//   node --test tests/rag-retrieval.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { indexExists, INDEX_PATH } from "../src/lib/rag/store.ts";
import { retrieve } from "../src/lib/rag/retrieve.ts";

function haveKey() {
  if (process.env.GEMINI_API_KEY) return true;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return /^GEMINI_API_KEY=.+/m.test(env);
  } catch {
    return false;
  }
}

const CASES = [
  { q: "Wie hoch darf die Mietkaution sein?", expect: "03-kaution-551" },
  { q: "Frist für die Betriebskostenabrechnung", expect: "04-betriebskosten-556-betrkv" },
  { q: "Sind starre Schönheitsreparatur-Fristen wirksam?", expect: "10-schoenheitsreparaturen" },
  { q: "Kündigungsfrist des Vermieters nach acht Jahren", expect: "13-kuendigungsfristen-573c" },
  { q: "generelles Hundeverbot im Mietvertrag", expect: "17-tierhaltung" },
];

for (const c of CASES) {
  test(`retrieval: "${c.q}" surfaces ${c.expect} in top-3`, async (t) => {
    if (!haveKey()) return t.skip("no GEMINI_API_KEY");
    if (!indexExists(INDEX_PATH)) return t.skip("no index — run: node scripts/rag-ingest.mjs");

    const hits = await retrieve(c.q, { topK: 3, autoBuild: false });
    const ids = hits.map((h) => h.chunk.docId);
    assert.ok(
      ids.includes(c.expect),
      `expected ${c.expect} in top-3, got [${ids.join(", ")}]`,
    );
    assert.ok(hits[0].score > 0.3, `top hit score ${hits[0].score} looks too low`);
  });
}
