# `src/lib/rag` — German rental-contract RAG (branch `rag/de-rental-contracts`)

An isolated experiment: draft **Germany-curated residential leases** (`Wohnraum­miet­vertrag`)
that are grounded in a retrieval step over German tenancy law, instead of the
ungrounded single prompt in `src/app/api/generate/route.ts`.

Nothing here is wired into the app. It runs from the CLI and from `node:test`.

## Pipeline

```
src/lib/rag/corpus/*.md          24 curated docs: BGB Mietrecht §§535–577a,
                                 BetrKV, Mietpreisbremse, BGH lines on
        │                        Schönheitsreparaturen / Kleinreparaturen / Tiere,
        │                        plus an annotated standard-contract template
        ▼
   chunk.ts        heading-aware split, ~1.1k chars, 160-char overlap
        ▼
   gemini.ts       embed via `gemini-embedding-001`, 768-d, L2-normalised
        ▼
   data/rag/de-rental-index.json     the local vector store (git-ignored)
        ▼
   retrieve.ts     embed query → brute-force cosine top-k (+ tiny lexical bonus)
        ▼
   generate.ts     grounded prompt → `gemini-3.6-flash` → Wohnraummietvertrag
```

The store is a plain JSON file scanned linearly — ~130 chunks × 768 floats, so a
query is sub-millisecond and no pgvector / external service is involved. That is
the "store the vectors locally" requirement.

## Use it

```bash
# 1. build the local index (needs GEMINI_API_KEY in .env.local)
npm run rag:ingest

# 2. run the eval agent: retrieval metrics + grounded-generation checks
npm run rag:eval                 # full
node scripts/rag-eval.mjs --no-generate   # retrieval only (no draft calls)
node scripts/rag-eval.mjs --rebuild       # rebuild index, then eval
```

`rag:eval` exits non-zero if `hit@5 < 0.90`, `MRR < 0.75`, or any generation case
misses a required statutory anchor (`§ 551`, `§ 556`, `§ 573c`, …) or trips a
forbidden pattern (`[EINFÜGEN]` placeholders, a deposit above the §551 cap). That
makes it usable as a pre-merge gate on this branch.

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

- `tests/rag-chunk.test.mjs` — pure: chunking, cosine, `search()`. Always runs.
- `tests/rag-retrieval.test.mjs` — retrieval smoke test; skips without a key or a
  built index.

## Notes / next steps

- The module deliberately does **not** import `src/lib/llm.ts` (that pulls in the
  `@/` path alias + `next/server`, which a bare `node` script can't resolve).
  `gemini.ts` is a small standalone REST client in the same style. If this graduates
  into the app, route generation through `askLLM()` and keep only the embedding
  client here.
- Corpus text is a paraphrase of public statutes plus standard clause wording; it
  is a drafting aid, not legal advice, and should be reviewed by a `Fachanwalt`.
- To integrate: add a `/api/generate/de` route (or branch `/api/generate` when
  `jurisdiction` is Germany + residential) that calls `generateGermanRentalContract`.
