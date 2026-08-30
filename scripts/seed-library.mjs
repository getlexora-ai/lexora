// Seed the system-curated clause library from the RAG corpus.
//
//   node scripts/seed-library.mjs             # upsert the ~33 curated rows (no key)
//   node scripts/seed-library.mjs --embed     # (re)compute embeddings (needs GEMINI_API_KEY)
//
// Needs DATABASE_URL in lexora/.env.local and the columns from
// db/006_clause_library.sql. Curated rows have user_id = NULL and are keyed by
// `doc_ref`, so re-running is an upsert, not a duplicate.

import { parseCuratedLibrary } from "../src/lib/library/parse-corpus.ts";
import { ragQuery, endRagPool } from "../src/lib/rag/db.ts";

const EMBED = process.argv.includes("--embed");

function vectorLiteral(v) {
  return `[${v.join(",")}]`;
}

async function upsertRows() {
  const rows = parseCuratedLibrary();
  let inserted = 0;
  let updated = 0;

  for (const r of rows) {
    const res = await ragQuery(
      `insert into clause_library
         (user_id, title, content, summary, clause_type, reference,
          jurisdiction, tags, source, posture, doc_ref)
       values (null, $1, $2, $3, $4, $5, 'DE', $6, 'curated', $7, $8)
       on conflict (doc_ref) where source = 'curated'
       do update set
         title      = excluded.title,
         content    = excluded.content,
         summary    = excluded.summary,
         clause_type= excluded.clause_type,
         reference  = excluded.reference,
         tags       = excluded.tags,
         posture    = excluded.posture,
         updated_at = now()
       returning (xmax = 0) as was_insert`,
      [r.title, r.content, r.summary, r.clause_type, r.reference, r.tags, r.posture, r.doc_ref],
    );
    if (res[0]?.was_insert) inserted++;
    else updated++;
  }

  // Drop curated rows whose doc_ref no longer exists in the corpus. FKs that
  // point here (playbook_rules.preferred_clause_id, later) are ON DELETE SET NULL.
  const keep = rows.map((r) => r.doc_ref);
  const orphans = await ragQuery(
    `delete from clause_library
      where source = 'curated' and not (doc_ref = any($1))
      returning doc_ref`,
    [keep],
  );

  return { total: rows.length, inserted, updated, removed: orphans.length };
}

async function embedRows() {
  const { embedTexts } = await import("../src/lib/rag/gemini.ts");

  const stale = await ragQuery(
    `select id, title, content
       from clause_library
      where deleted_at is null
        and (embedding is null or embedded_at is null or embedded_at < updated_at)
      order by created_at`,
  );
  if (stale.length === 0) return { embedded: 0 };

  const vectors = await embedTexts(
    stale.map((r) => `${r.title} — ${r.content}`),
    "RETRIEVAL_DOCUMENT",
  );

  for (let i = 0; i < stale.length; i++) {
    await ragQuery(
      `update clause_library set embedding = $1::vector, embedded_at = now() where id = $2`,
      [vectorLiteral(vectors[i]), stale[i].id],
    );
  }
  return { embedded: stale.length };
}

try {
  const t0 = Date.now();
  const seed = await upsertRows();
  console.log(`\n  clause_library — curated seed`);
  console.log(`  rows in corpus   ${seed.total}`);
  console.log(`  inserted         ${seed.inserted}`);
  console.log(`  updated          ${seed.updated}`);
  console.log(`  removed (orphan) ${seed.removed}`);

  if (EMBED) {
    const e = await embedRows();
    console.log(`  embedded         ${e.embedded}`);
  } else {
    console.log(`  embeddings       skipped (pass --embed with GEMINI_API_KEY)`);
  }
  console.log(`  elapsed          ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
} finally {
  await endRagPool();
}
