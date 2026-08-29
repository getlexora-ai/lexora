// The local vector store: a single JSON file + brute-force cosine search.
// No pgvector, no external service. ~130 chunks * 768 floats is well under a MB
// and a linear scan is sub-millisecond, so nothing fancier is warranted here.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { IndexedChunk, RagIndex, RetrievalHit } from "./types.ts";

// Repo root is three levels up from src/lib/rag/.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Canonical on-disk location of the index. */
export const INDEX_PATH = join(REPO_ROOT, "data", "rag", "de-rental-index.json");

/** Dot product. Vectors from gemini.ts are L2-normalised, so this is cosine. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function saveIndex(index: RagIndex, path: string = INDEX_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(index), "utf8");
}

export function indexExists(path: string = INDEX_PATH): boolean {
  return existsSync(path);
}

export function loadIndex(path: string = INDEX_PATH): RagIndex {
  if (!existsSync(path)) {
    throw new Error(
      `No vector index at ${path}. Build it first: node scripts/rag-ingest.mjs`,
    );
  }
  const index = JSON.parse(readFileSync(path, "utf8")) as RagIndex;
  if (!Array.isArray(index.chunks) || index.chunks.length === 0) {
    throw new Error(`Vector index at ${path} is empty or malformed.`);
  }
  return index;
}

/**
 * Top-k by cosine similarity, with a small lexical tie-breaker: chunks whose
 * text literally contains a query token (case-insensitive, len >= 4) get a tiny
 * bonus. This nudges exact "§ 551" / "Kappungsgrenze" style hits above near-
 * synonyms without overriding the semantic ranking.
 */
export function search(
  queryEmbedding: number[],
  chunks: IndexedChunk[],
  k: number,
  queryText = "",
): RetrievalHit[] {
  const tokens = queryText
    .toLowerCase()
    .split(/[^\p{L}\p{N}§]+/u)
    .filter((t) => t.length >= 4);

  const scored = chunks.map((chunk) => {
    let score = cosine(queryEmbedding, chunk.embedding);
    if (tokens.length) {
      const hay = chunk.text.toLowerCase();
      const hits = tokens.filter((t) => hay.includes(t)).length;
      score += 0.01 * (hits / tokens.length);
    }
    const { embedding, ...bare } = chunk;
    void embedding;
    return { chunk: bare, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
