// Build the local vector index from the curated corpus.

import { loadCorpus } from "./corpus.ts";
import { chunkCorpus, embedText } from "./chunk.ts";
import { embedTexts, EMBED_MODEL, EMBED_DIM } from "./gemini.ts";
import { saveIndex, INDEX_PATH } from "./store.ts";
import type { IndexedChunk, RagIndex } from "./types.ts";

export type IngestReport = {
  path: string;
  docCount: number;
  chunkCount: number;
  dim: number;
  bytes: number;
  elapsedMs: number;
};

/**
 * corpus/*.md -> chunks -> Gemini embeddings (RETRIEVAL_DOCUMENT) -> JSON file.
 * Returns a small report; also writes to `path` (defaults to INDEX_PATH).
 */
export async function buildIndex(path: string = INDEX_PATH): Promise<IngestReport> {
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
    chunks: indexed,
  };

  saveIndex(index, path);
  const bytes = Buffer.byteLength(JSON.stringify(index));

  return {
    path,
    docCount: docs.length,
    chunkCount: indexed.length,
    dim: EMBED_DIM,
    bytes,
    elapsedMs: Date.now() - started,
  };
}
