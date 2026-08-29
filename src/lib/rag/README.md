# `src/lib/rag` — German rental-contract RAG

Draft **Germany-curated residential leases** (`Wohnraum­miet­vertrag`) grounded in a
retrieval step over German tenancy law, instead of the ungrounded single prompt
in `src/app/api/generate/route.ts`.

**Wired into the app:** `POST /api/generate` routes here when
`jurisdiction === "Germany"` and `contractType === "Lease Agreement"`. Everything
else still uses the generic `askLLM()` path, unchanged.

## Pipeline

```
src/lib/rag/corpus/*.md          24 curated docs: BGB Mietrecht §§535–577a,
                                 BetrKV, Mietpreisbremse, BGH lines on
        │                        Schönheitsreparaturen / Kleinreparaturen / Tiere,
        │                        plus an annotated standard-contract template
        ▼
   chunk.ts        heading-aware split, greedy-packed (~900 char target)
        ▼
   gemini.ts       embed via `gemini-embedding-001`, 768-d, L2-normalised
        ▼
   rag_chunks (pgvector)          Postgres table, HNSW cosine index
        ▼                         (db/005_rag_corpus.sql)
   retrieve.ts     embed query → cosine ORDER BY, round-robin multi-query merge
        ▼
   generate.ts     grounded prompt → LLM → Wohnraummietvertrag
```

Generation is injectable (`GenerateOptions.complete`): the API route passes an
adapter over `src/lib/llm.ts` `askLLM()` so the customer-facing path gets the
app's error handling and retry behaviour; the CLI falls back to the standalone
`gemini.ts` REST client. `gemini.ts` remains the embedding client for both.

## Setup & operations

```bash
# 1. once per database — create the pgvector tables
psql "$DATABASE_URL" -f db/005_rag_corpus.sql

# 2. load / rebuild the knowledge base (needs GEMINI_API_KEY + DATABASE_URL)
npm run rag:ingest

# 3. the eval agent: retrieval metrics + grounded-generation checks
npm run rag:eval                          # full
node scripts/rag-eval.mjs --no-generate   # retrieval only (no draft calls)
node scripts/rag-eval.mjs --rebuild       # re-ingest, then eval
```

`rag:eval` exits non-zero if `hit@5 < 0.90`, `MRR < 0.75`, or any generation case
misses a required statutory anchor (`§ 551`, `§ 556`, `§ 573c`, …) or trips a
forbidden pattern (`[EINFÜGEN]` placeholders, a deposit above the §551 cap). Use
it as a pre-deploy gate whenever the corpus changes.

`rag_index_meta` records the embedding model, dimensionality and a corpus hash;
`assertIndexFresh()` refuses to retrieve against an index built with a different
model/dim.

## Programmatic entry point

```ts
import { generateGermanRentalContract } from "@/lib/rag";

const { contract, groundingRefs, context } = await generateGermanRentalContract({
  landlord: "Anna Vermieterin",
  tenant: "Ben Mieter",
  propertyAddress: "Musterstraße 12, 10115 Berlin",
  baseRentEur: 1200,
  operatingCostsEur: 250,
  depositEur: 3000,
  keyTerms: "Kleiner Hund erlaubt. Mietbeginn 1. März 2026.",
});
```

## Tests

- `tests/rag-chunk.test.mjs` — pure: chunking, cosine, in-memory `search()`. Always runs.
- `tests/rag-retrieval.test.mjs` — retrieval smoke test; skips without a key, a
  `DATABASE_URL`, the migration, or an ingested corpus.

## Notes / next steps

- Corpus text is a paraphrase of public statutes plus standard clause wording; it
  is a drafting aid, not legal advice, and should be reviewed by a `Fachanwalt`.
  Each doc needs a review date and an owner (see `FEEDBACK.md`).
- The pipeline (chunk / embed / store / retrieve) and the domain pack (corpus +
  `buildQueries` + system prompt) are still coupled through
  `generateGermanRentalContract`. Factor them apart before a second jurisdiction
  lands — `FEEDBACK.md` covers this and the other known gaps.
