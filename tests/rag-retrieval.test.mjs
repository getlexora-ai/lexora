// Retrieval smoke test against the pgvector index.
// Needs GEMINI_API_KEY (to embed the query) and DATABASE_URL (the vector store),
// plus an ingested corpus. Skips cleanly when any of those is missing.
//   psql "$DATABASE_URL" -f db/005_rag_corpus.sql   # once
//   node scripts/rag-ingest.mjs                      # load the corpus
//   node --test tests/rag-retrieval.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { indexMeta } from "../src/lib/rag/store.ts";
import { retrieve } from "../src/lib/rag/retrieve.ts";
import { endRagPool } from "../src/lib/rag/db.ts";

function envHas(key) {
  if (process.env[key]) return true;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return new RegExp(`^${key}=.+`, "m").test(env);
  } catch {
    return false;
  }
}

const READY = envHas("GEMINI_API_KEY") && envHas("DATABASE_URL");

const CASES = [
  { q: "Wie hoch darf die Mietkaution sein?", expect: "03-kaution-551" },
  { q: "Frist für die Betriebskostenabrechnung", expect: "04-betriebskosten-556-betrkv" },
  { q: "Sind starre Schönheitsreparatur-Fristen wirksam?", expect: "10-schoenheitsreparaturen" },
  { q: "Kündigungsfrist des Vermieters nach acht Jahren", expect: "13-kuendigungsfristen-573c" },
  { q: "generelles Hundeverbot im Mietvertrag", expect: "17-tierhaltung" },
];

for (const c of CASES) {
  test(`retrieval: "${c.q}" surfaces ${c.expect} in top-3`, async (t) => {
    if (!READY) return t.skip("no GEMINI_API_KEY / DATABASE_URL");

    let meta;
    try {
      meta = await indexMeta();
    } catch {
      return t.skip("RAG tables not migrated — run db/005_rag_corpus.sql");
    }
    if (!meta) return t.skip("index empty — run: node scripts/rag-ingest.mjs");

    const hits = await retrieve(c.q, { topK: 3 });
    const ids = hits.map((h) => h.chunk.docId);
    assert.ok(
      ids.includes(c.expect),
      `expected ${c.expect} in top-3, got [${ids.join(", ")}]`,
    );
    assert.ok(hits[0].score > 0.3, `top hit score ${hits[0].score} looks too low`);
  });
}

test.after(async () => {
  await endRagPool();
});
