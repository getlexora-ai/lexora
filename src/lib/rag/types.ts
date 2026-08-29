// Shared types for the German-rental RAG pipeline.
// Kept dependency-free so plain `node` scripts (type-stripping) can import it.

/** A source document loaded from src/lib/rag/corpus/*.md. */
export type CorpusDoc = {
  /** File basename without extension, e.g. "03-kaution-551". */
  id: string;
  title: string;
  /** Free-text provenance note (statute reference, "paraphrased", etc.). */
  source: string;
  tags: string[];
  /** Markdown body with the frontmatter stripped. */
  body: string;
};

/** A retrievable slice of a CorpusDoc. */
export type Chunk = {
  /** `${docId}#${ordinal}` — stable across rebuilds unless the doc changes. */
  id: string;
  docId: string;
  docTitle: string;
  /** Nearest enclosing markdown heading, or the doc title for the lead section. */
  heading: string;
  tags: string[];
  text: string;
};

/** A Chunk plus its embedding vector (L2-normalised). */
export type IndexedChunk = Chunk & { embedding: number[] };

/** The on-disk local vector store. */
export type RagIndex = {
  /** Embedding model id used to build every vector here. */
  model: string;
  /** Vector dimensionality. */
  dim: number;
  /** ISO timestamp. */
  builtAt: string;
  /** Number of source docs that fed the index. */
  docCount: number;
  chunks: IndexedChunk[];
};

/** One retrieval result. `score` is cosine similarity in [-1, 1]. */
export type RetrievalHit = {
  chunk: Chunk;
  score: number;
};

export type GenerateParams = {
  /** Landlord / Vermieter name. */
  landlord: string;
  /** Tenant / Mieter name. */
  tenant: string;
  /** Free-text address of the flat. */
  propertyAddress: string;
  /** Cold rent in EUR/month. */
  baseRentEur: number;
  /** Operating-cost advance in EUR/month. */
  operatingCostsEur?: number;
  /** Security deposit in EUR (validated against §551 in the prompt). */
  depositEur?: number;
  /** Extra client requirements, verbatim. */
  keyTerms?: string;
  /** Retrieval breadth (merged across sub-queries). Default 12. */
  topK?: number;
};

export type GenerateResult = {
  /** The drafted contract, German, ready to review. */
  contract: string;
  /** Statute references the model was given as grounding, e.g. ["§ 551 BGB", ...]. */
  groundingRefs: string[];
  /** The chunks retrieved for this draft, best-first. */
  context: RetrievalHit[];
};
