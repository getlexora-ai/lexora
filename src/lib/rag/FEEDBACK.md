# RAG architecture — review & next steps

Feedback on the German rental-contract RAG, written during the merge from
`rag/de-rental-contracts` into `main` + the move to pgvector. Split into what the
prototype got right, what this integration changed, and what is still open.

## What the prototype got right

- **Genuinely grounded.** Retrieve → render context → "cite only what you were
  given" prompt, with `extractStatuteRefs()` surfacing the grounding set. Not a
  RAG-flavoured single prompt.
- **Multi-query round-robin merge** (`retrieveMany`). A lease draft is a broad
  request; pulling one focused sub-query per building block (Kaution,
  Betriebskosten, Kündigung…) and interleaving by rank stops one tight-matching
  topic from crowding the context window. This is the right call for the shape
  of the task.
- **The eval agent** (`scripts/rag-eval.mjs`). hit@5 / MRR thresholds *plus*
  generation checks for required statute anchors and forbidden patterns
  (`[EINFÜGEN]`, a deposit over the §551 cap), non-zero exit on a miss. Most
  prototypes ship with nothing that can gate a deploy.
- **Task-typed embeddings** (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY`) and
  L2-normalised vectors so cosine is a dot product. Both correct, both commonly
  skipped.
- **Heading-aware, greedily-packed chunking.** Right for a small curated corpus —
  fewer, denser chunks retrieve better and keep the embed cost down.
- **Quota-aware Gemini client** — honours the 429 `retryDelay` hint, paces
  batches. Thoughtful about the free tier.

## Changed in this integration

- **Vector store → pgvector in Neon** (`db/005_rag_corpus.sql`, `rag_chunks`).
  The git-ignored JSON file + lazy `buildIndex()` on first request was a
  prototype pattern that breaks on a read-only / ephemeral filesystem and
  re-embeds the whole corpus on every cold start. The knowledge base is now one
  governed table next to the rest of the app.
- **`rag_index_meta`** records embedding model, dimensionality and a corpus
  hash. `assertIndexFresh()` refuses to retrieve when the stored model/dim no
  longer matches the code — a model bump used to silently mix vector spaces.
- **Generation is injectable.** The API route passes an adapter over
  `src/lib/llm.ts` `askLLM()`, so the customer path shares the app's `AppError`
  taxonomy, `blockReason` handling and retry policy. `rag/gemini.ts` stays as the
  embedding client (and the CLI's generation fallback). The two-client split is
  now deliberate, not accidental.
- **Query-time floor.** The route checks the top retrieval score
  (`MIN_GROUNDING_SCORE`) and marks `grounded: false` rather than citing thin
  context. Currently near-dead code because a structured lease request always
  retrieves high; it earns its keep once free-text queries reach the pipeline.
- **`retrieveMany` no longer mutates shared hit objects** on the score-merge
  path.
- **Lexical `+0.01` tie-breaker dropped** in the pgvector path (see below).

## Still open — ranked

1. **The eval set is too easy and self-authored.** 14 retrieval + 2 generation
   cases, written by whoever wrote the corpus, scoring hit@5 100% / MRR 1.000.
   A perfect score means the eval has stopped discriminating. Needs: paraphrased
   queries with no lexical overlap; adversarial generation cases (client asks for
   a 4-month deposit, or rigid Schönheitsreparatur fristen — the draft must
   refuse/correct); and **abstention cases** — queries outside the corpus that
   should retrieve nothing above the floor. Target a set where a real regression
   can actually drop the number.

2. **`buildQueries()` is hand-maintained regex routing.** Six base sub-queries
   plus keyword-triggered extras (`/tier|hund|katze/`, …). A typo or a new corpus
   doc with no matching trigger silently drops a whole topic from every draft.
   Options: derive sub-queries from corpus doc titles/tags, or a one-shot
   query-expansion call. At minimum, assert in the eval that every corpus doc is
   reachable from some sub-query.

3. **Corpus has no versioning or ownership.** It is a paraphrase of statutes with
   no per-doc review date and no owner. German tenancy law moves
   (Mietpreisbremse extensions, BGH lines). Add `reviewed: YYYY-MM-DD` and
   `owner:` to each doc's frontmatter; have the eval warn when a doc is stale by
   N months. The `corpus_hash` in `rag_index_meta` already flags
   "corpus changed, store not re-ingested" — wire that into CI.

4. **No clause-level provenance in the output.** `groundingRefs` is a flat list
   for the whole contract; a reviewer can't see which chunk supported which
   clause. For a legal drafting aid this is the gap that matters most. Consider a
   structured return (`{ clause, groundingDocIds }[]`) or inline `[doc-id]`
   markers the UI can resolve.

5. **Hybrid search was removed, not tuned.** The `+0.01` lexical nudge was an
   untuned constant; dropping it changed retrieval scores by <0.003 and nothing
   in the eval. If exact-token matches (`§ 551`, `Kappungsgrenze`) ever need a
   thumb on the scale, do it properly: pgvector supports combining
   `embedding <=> q` with a `ts_rank` / `websearch_to_tsquery` term under a tuned
   weight, evaluated against a set that actually rewards it.

6. **`retrieveMany` merges in app code, not SQL.** Fine at 69 chunks and 6–9
   sub-queries. If the corpus or the sub-query count grows, this becomes N
   round-trips per draft; fold it into one query (`UNION ALL` of per-sub-query
   `ORDER BY … LIMIT`, dedupe outside) or a single multi-vector call.

7. **Pipeline and domain pack are still coupled.** `chunk / embed / store /
   retrieve` is generic; `corpus + buildQueries + SYSTEM` is
   German-residential-lease-specific, but they're only separable by reading
   `generate.ts`. Factor a `DomainPack` interface (corpus dir, sub-query builder,
   system prompt, eval set) before a second jurisdiction or contract type lands —
   it is much cheaper now than after.

8. **HNSW index on 69 rows is theatre.** Harmless, but a plain sequential scan is
   exact and faster at this size. Keep the HNSW definition (it's correct for
   growth) but know the recall/latency numbers only start to matter in the
   thousands.

9. **`data/rag/` is now vestigial.** `data/rag/README.md` is repointed; delete
   the directory and the `/data/rag/*.json` `.gitignore` line once every branch
   is on the Postgres store.
