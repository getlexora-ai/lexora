// Public surface of the German-rental RAG module.
//
// Pipeline:  corpus/*.md → chunk → embed (Gemini, 768-d, local JSON store)
//            → retrieve (cosine) → generate (grounded Wohnraummietvertrag)
//
// CLI:  node scripts/rag-ingest.mjs   (build the vector store)
//       node scripts/rag-eval.mjs     (score retrieval + generation)

export type {
  CorpusDoc,
  Chunk,
  IndexedChunk,
  RagIndex,
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
export { buildIndex } from "./ingest.ts";
export {
  INDEX_PATH,
  cosine,
  search,
  loadIndex,
  saveIndex,
  indexExists,
} from "./store.ts";
export { retrieve, retrieveMany, extractStatuteRefs } from "./retrieve.ts";
export { generateGermanRentalContract } from "./generate.ts";
