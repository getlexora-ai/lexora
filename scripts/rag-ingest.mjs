// Build (or rebuild) the local vector store for the German-rental RAG module.
//
//   node scripts/rag-ingest.mjs
//
// Reads GEMINI_API_KEY from lexora/.env.local. Writes data/rag/de-rental-index.json.

import { buildIndex } from "../src/lib/rag/ingest.ts";
import { INDEX_PATH } from "../src/lib/rag/store.ts";

const report = await buildIndex(INDEX_PATH);

const kb = (report.bytes / 1024).toFixed(0);
console.log(`\n  built ${report.path}`);
console.log(`  docs        ${report.docCount}`);
console.log(`  chunks      ${report.chunkCount}`);
console.log(`  dimensions  ${report.dim}`);
console.log(`  size        ${kb} KB`);
console.log(`  elapsed     ${(report.elapsedMs / 1000).toFixed(1)} s\n`);
