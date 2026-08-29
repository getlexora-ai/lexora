// Load (or rebuild) the German-rental RAG knowledge base in Postgres.
//
//   node scripts/rag-ingest.mjs
//
// Needs GEMINI_API_KEY and DATABASE_URL in lexora/.env.local, and the tables
// from db/005_rag_corpus.sql. Replaces rag_chunks transactionally.

import { buildIndex } from "../src/lib/rag/ingest.ts";
import { endRagPool } from "../src/lib/rag/db.ts";

try {
  const report = await buildIndex();
  console.log(`\n  loaded the knowledge base into Postgres (rag_chunks)`);
  console.log(`  docs        ${report.docCount}`);
  console.log(`  chunks      ${report.chunkCount}`);
  console.log(`  dimensions  ${report.dim}`);
  console.log(`  corpus hash ${report.corpusHash}`);
  console.log(`  elapsed     ${(report.elapsedMs / 1000).toFixed(1)} s\n`);
} finally {
  await endRagPool();
}
