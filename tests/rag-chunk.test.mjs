// Pure unit tests for the RAG chunking + local vector math. No network, no key —
// always runs.
//   node --test tests/rag-chunk.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { chunkDoc, chunkCorpus, embedText } from "../src/lib/rag/chunk.ts";
import { loadCorpus } from "../src/lib/rag/corpus.ts";
import { cosine, search } from "../src/lib/rag/store.ts";

// ── chunkDoc ──────────────────────────────────────────────────
test("chunkDoc: packs small sections into one chunk, keeping heading markers", () => {
  const doc = {
    id: "demo",
    title: "Demo",
    source: "test",
    tags: ["a", "b"],
    body: [
      "Lead paragraph before any heading.",
      "",
      "## Erste Überschrift",
      "Inhalt eins.",
      "",
      "### Unterabschnitt",
      "Inhalt zwei.",
    ].join("\n"),
  };
  const chunks = chunkDoc(doc);
  assert.equal(chunks.length, 1, "three tiny sections collapse into a single chunk");
  assert.equal(chunks[0].id, "demo#0");
  assert.equal(chunks[0].docId, "demo");
  assert.deepEqual(chunks[0].tags, ["a", "b"]);
  assert.match(chunks[0].text, /Lead paragraph/);
  assert.match(chunks[0].text, /Erste Überschrift/);
  assert.match(chunks[0].text, /Inhalt zwei\./);
});

test("chunkDoc: a big section breaks away from the packed lead", () => {
  const big = "Ein längerer Absatz mit Substanz. ".repeat(40); // ~1.3k chars
  const doc = {
    id: "mix",
    title: "Mix",
    source: "test",
    tags: [],
    body: `Kurzer Vorspann.\n\n## Großer Abschnitt\n${big}`,
  };
  const chunks = chunkDoc(doc);
  assert.ok(chunks.length >= 2);
  assert.match(chunks[0].text, /Kurzer Vorspann/);
  assert.equal(chunks[1].heading, "Großer Abschnitt");
});

test("chunkDoc: a long section is split into overlapping pieces", () => {
  const para = "Dies ist ein Satz mit etwas Inhalt. ".repeat(20); // ~700 chars
  const doc = {
    id: "long",
    title: "Long",
    source: "test",
    tags: [],
    body: `## Abschnitt\n${para}\n\n${para}\n\n${para}`,
  };
  const chunks = chunkDoc(doc);
  assert.ok(chunks.length >= 2, "expected the >1.1k-char section to be split");
  assert.ok(chunks.every((c) => c.text.length <= 1400));
});

test("embedText: prefixes doc title and heading for lexical context", () => {
  const [chunk] = chunkDoc({
    id: "x",
    title: "Kaution",
    source: "t",
    tags: [],
    body: "## § 551 BGB\nDrei Nettokaltmieten.",
  });
  const text = embedText(chunk);
  assert.match(text, /^Kaution — § 551 BGB/);
  assert.match(text, /Drei Nettokaltmieten\./);
});

// ── corpus wiring ─────────────────────────────────────────────
test("loadCorpus + chunkCorpus: real corpus parses and chunks", () => {
  const docs = loadCorpus();
  assert.ok(docs.length >= 20, `expected >=20 corpus docs, got ${docs.length}`);
  assert.ok(docs.every((d) => d.title && d.body.length > 200));

  const kaution = docs.find((d) => d.id === "03-kaution-551");
  assert.ok(kaution, "03-kaution-551.md should load");
  assert.ok(kaution.tags.includes("kaution"));

  const chunks = chunkCorpus(docs);
  assert.ok(chunks.length >= docs.length, "every doc yields at least one chunk");
  assert.ok(chunks.every((c) => c.id.includes("#")));
});

// ── cosine + search ───────────────────────────────────────────
test("cosine: identical vectors ~1, orthogonal ~0", () => {
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
});

test("cosine: dimension mismatch throws", () => {
  assert.throws(() => cosine([1, 2], [1, 2, 3]), /dimension mismatch/);
});

test("search: ranks by similarity and applies the lexical tie-breaker", () => {
  const chunks = [
    { id: "a#0", docId: "a", docTitle: "A", heading: "h", tags: [], text: "Kappungsgrenze zwanzig Prozent", embedding: [1, 0, 0] },
    { id: "b#0", docId: "b", docTitle: "B", heading: "h", tags: [], text: "etwas anderes", embedding: [0, 1, 0] },
    { id: "c#0", docId: "c", docTitle: "C", heading: "h", tags: [], text: "noch etwas", embedding: [0.9, 0.1, 0] },
  ];
  const hits = search([1, 0, 0], chunks, 2, "Kappungsgrenze");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].chunk.docId, "a");
  assert.ok(!("embedding" in hits[0].chunk), "search must strip embeddings from results");
  assert.ok(hits[0].score > hits[1].score);
});
