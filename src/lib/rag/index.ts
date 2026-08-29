// Public surface of the German-rental RAG module.
//
// Pipeline:  corpus/*.md → chunk → embed (Gemini, 768-d) → pgvector (rag_chunks)
//            → retrieve (cosine) → generate (grounded Wohnraummietvertrag)
//
// Setup:  psql "$DATABASE_URL" -f db/005_rag_corpus.sql   (once)
// CLI:    npm run rag:ingest    (load / rebuild the vector store)
//         npm run rag:eval      (score retrieval + generation)

export type {
  CorpusDoc,
  Chunk,
  IndexedChunk,
  RagIndex,
  RagIndexMeta,
  RetrievalHit,
  GenerateParams,
  GenerateResult,
} from "./types.ts";

export { loadCorpus } from "./corpus.ts";
export { chunkDoc, chunkCorpus, embedText } from "./chunk.ts";
export {
  embedTexts,
  embedOne,
  complete,
  QuotaExhaustedError,
  EMBED_MODEL,
  EMBED_DIM,
} from "./gemini.ts";
export { ragQuery, endRagPool } from "./db.ts";
export { buildIndex } from "./ingest.ts";
export {
  cosine,
  search,
  saveIndex,
  indexMeta,
  indexExists,
  assertIndexFresh,
  queryIndex,
} from "./store.ts";
export { retrieve, retrieveMany, extractStatuteRefs } from "./retrieve.ts";
export { generateGermanRentalContract } from "./generate.ts";
