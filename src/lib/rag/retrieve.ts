// Query-time retrieval against the local index.

import { embedOne } from "./gemini.ts";
import { loadIndex, search, indexExists, INDEX_PATH } from "./store.ts";
import { buildIndex } from "./ingest.ts";
import type { RetrievalHit } from "./types.ts";

export type RetrieveOptions = {
  /** Number of chunks to return. Default 8. */
  topK?: number;
  /** Build the index automatically if the file is missing. Default true. */
  autoBuild?: boolean;
  /** Override the index path (tests). */
  indexPath?: string;
};

/** Embed `query` and return the top-k chunks by cosine similarity. */
export async function retrieve(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievalHit[]> {
  const { topK = 8, autoBuild = true, indexPath = INDEX_PATH } = opts;

  if (!indexExists(indexPath)) {
    if (!autoBuild) {
      throw new Error(`No index at ${indexPath} and autoBuild is off.`);
    }
    await buildIndex(indexPath);
  }

  const index = loadIndex(indexPath);
  const queryVec = await embedOne(query, "RETRIEVAL_QUERY");
  return search(queryVec, index.chunks, topK, query);
}

/**
 * Retrieve for several sub-queries and merge by ROUND-ROBIN: take each
 * sub-query's #1 hit, then everyone's #2, and so on, deduping by chunk id until
 * topK is filled. This guarantees every contract building block (Kaution,
 * Betriebskosten, Kündigung, …) is represented in the context, instead of a few
 * tight-matching topics crowding the rest out on absolute score.
 */
export async function retrieveMany(
  queries: string[],
  opts: RetrieveOptions = {},
): Promise<RetrievalHit[]> {
  const { topK = 12 } = opts;
  const perQuery = Math.max(3, Math.ceil(topK / Math.max(queries.length, 1)) + 2);

  const results = await Promise.all(
    queries.map((q) => retrieve(q, { ...opts, topK: perQuery })),
  );

  const picked = new Map<string, RetrievalHit>();
  for (let rank = 0; picked.size < topK && rank < perQuery; rank++) {
    for (const hits of results) {
      const hit = hits[rank];
      if (!hit || picked.size >= topK) continue;
      const prev = picked.get(hit.chunk.id);
      if (!prev) picked.set(hit.chunk.id, hit);
      else if (hit.score > prev.score) prev.score = hit.score;
    }
  }
  return [...picked.values()].sort((a, b) => b.score - a.score);
}

/** Pull the "§ 123 BGB" / "§ 556d BGB" style references out of retrieved text. */
export function extractStatuteRefs(hits: RetrievalHit[]): string[] {
  const seen = new Set<string>();
  const re = /§\s?\d+[a-z]?(?:\s?(?:Abs\.?\s?\d+|BGB|BetrKV|BImA))*/gi;
  for (const hit of hits) {
    for (const raw of hit.chunk.text.match(re) ?? []) {
      const norm = raw.replace(/\s+/g, " ").replace(/§(?=\d)/, "§ ").trim();
      seen.add(norm);
    }
  }
  return [...seen];
}
