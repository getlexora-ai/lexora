// Build the vector index from the curated corpus and load it into Postgres.

import { createHash } from "node:crypto";
import { loadCorpus } from "./corpus.ts";
import { chunkCorpus, embedText } from "./chunk.ts";
import { embedTexts, EMBED_MODEL, EMBED_DIM } from "./gemini.ts";
import { saveIndex } from "./store.ts";
import type { IndexedChunk, RagIndex } from "./types.ts";

export type IngestReport = {
  docCount: number;
  chunkCount: number;
  dim: number;
  corpusHash: string;
  elapsedMs: number;
};

/** Short, stable digest of the corpus text — stored so drift is detectable. */
function hashCorpus(docs: { id: string; body: string }[]): string {
  const h = createHash("sha256");
  for (const d of docs) h.update(`${d.id}\n${d.body}\n---\n`);
  return h.digest("hex").slice(0, 16);
}

/**
 * corpus/*.md -> chunks -> Gemini embeddings (RETRIEVAL_DOCUMENT) -> rag_chunks.
 * Replaces the existing index transactionally (see saveIndex).
 */
export async function buildIndex(): Promise<IngestReport> {
  const started = Date.now();

  const docs = loadCorpus();
  if (docs.length === 0) throw new Error("Corpus is empty — nothing to index.");

  const chunks = chunkCorpus(docs);
  const vectors = await embedTexts(chunks.map(embedText), "RETRIEVAL_DOCUMENT");

  const indexed: IndexedChunk[] = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i],
  }));

  const index: RagIndex = {
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    builtAt: new Date().toISOString(),
    docCount: docs.length,
    corpusHash: hashCorpus(docs),
    chunks: indexed,
  };

  await saveIndex(index);

  return {
    docCount: docs.length,
    chunkCount: indexed.length,
    dim: EMBED_DIM,
    corpusHash: index.corpusHash,
    elapsedMs: Date.now() - started,
  };
}
