// The vector store: pgvector in Postgres (table `rag_chunks`, see
// db/005_rag_corpus.sql). Retrieval is a cosine-distance ORDER BY against the
// HNSW index; at ~70 chunks it is effectively exact.
//
// `cosine()` and the in-memory `search()` below are pure vector math kept for
// unit tests and callers that already hold the vectors — the live pipeline goes
// through queryIndex().

import { ragQuery, ragPool } from "./db.ts";
import { EMBED_MODEL, EMBED_DIM } from "./gemini.ts";
import type {
  IndexedChunk,
  RagIndex,
  RagIndexMeta,
  RetrievalHit,
} from "./types.ts";

// ── pure vector math (unit-tested; not on the live path) ─────────────────────

/** Dot product. Vectors from gemini.ts are L2-normalised, so this is cosine. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * In-memory top-k by cosine, with a small lexical tie-breaker: chunks whose text
 * literally contains a query token (case-insensitive, len >= 4) get a tiny
 * bonus. Retained for tests; the live path uses queryIndex() (pure vector).
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

// ── pgvector store ──────────────────────────────────────────────────────────

/** pgvector's text input format for a float array: `[0.1,0.2,…]`. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Replace the entire index in one transaction: wipe `rag_chunks`, insert the
 * fresh chunks, upsert the provenance row. All-or-nothing so a failed ingest
 * never leaves a half-loaded corpus.
 */
export async function saveIndex(index: RagIndex): Promise<void> {
  const client = await ragPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from rag_chunks");
    for (const c of index.chunks) {
      await client.query(
        `insert into rag_chunks (id, doc_id, doc_title, heading, tags, text, embedding)
         values ($1, $2, $3, $4, $5, $6, $7::vector)`,
        [c.id, c.docId, c.docTitle, c.heading, c.tags, c.text, toVectorLiteral(c.embedding)],
      );
    }
    await client.query(
      `insert into rag_index_meta (id, model, dim, corpus_hash, doc_count, chunk_count, built_at)
       values (1, $1, $2, $3, $4, $5, now())
       on conflict (id) do update set
         model = excluded.model, dim = excluded.dim, corpus_hash = excluded.corpus_hash,
         doc_count = excluded.doc_count, chunk_count = excluded.chunk_count, built_at = now()`,
      [index.model, index.dim, index.corpusHash, index.docCount, index.chunks.length],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** The provenance row, or null if the corpus has never been ingested. */
export async function indexMeta(): Promise<RagIndexMeta | null> {
  const rows = await ragQuery<{
    model: string;
    dim: number;
    corpus_hash: string;
    doc_count: number;
    chunk_count: number;
    built_at: Date;
  }>(
    `select model, dim, corpus_hash, doc_count, chunk_count, built_at
       from rag_index_meta where id = 1`,
  );
  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    model: m.model,
    dim: Number(m.dim),
    corpusHash: m.corpus_hash,
    docCount: Number(m.doc_count),
    chunkCount: Number(m.chunk_count),
    builtAt: new Date(m.built_at).toISOString(),
  };
}

/** True when the corpus has been ingested and holds at least one chunk. */
export async function indexExists(): Promise<boolean> {
  const meta = await indexMeta();
  return !!meta && meta.chunkCount > 0;
}

/**
 * Guard the retrieval path: the index must exist and must have been built with
 * the embedding model/dimensionality the code currently expects. A mismatch
 * means the stored vectors live in a different space than a fresh query vector.
 */
export function assertIndexFresh(
  meta: RagIndexMeta | null,
): asserts meta is RagIndexMeta {
  if (!meta) {
    throw new Error(
      "RAG vector store is empty. Load it with: npm run rag:ingest",
    );
  }
  if (meta.model !== EMBED_MODEL || meta.dim !== EMBED_DIM) {
    throw new Error(
      `RAG index was built with ${meta.model}/${meta.dim}-d but the code now ` +
        `expects ${EMBED_MODEL}/${EMBED_DIM}-d. Rebuild: npm run rag:ingest`,
    );
  }
}

/** Embed-then-rank is the caller's job; this runs the cosine ORDER BY. */
export async function queryIndex(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievalHit[]> {
  const rows = await ragQuery<{
    id: string;
    doc_id: string;
    doc_title: string;
    heading: string;
    tags: string[] | null;
    text: string;
    score: string;
  }>(
    `select id, doc_id, doc_title, heading, tags, text,
            1 - (embedding <=> $1::vector) as score
       from rag_chunks
      order by embedding <=> $1::vector
      limit $2`,
    [toVectorLiteral(queryEmbedding), k],
  );
  return rows.map((r) => ({
    chunk: {
      id: r.id,
      docId: r.doc_id,
      docTitle: r.doc_title,
      heading: r.heading,
      tags: r.tags ?? [],
      text: r.text,
    },
    score: Number(r.score),
  }));
}
