-- Migration: RAG knowledge base for German residential-lease drafting.
-- Moves the German-tenancy-law vector store off the local JSON file and into
-- Postgres (pgvector), so it is one governed thing in the same database as the
-- rest of the app and survives Railway redeploys.
-- Run:  psql "$DATABASE_URL" -f db/005_rag_corpus.sql
--
-- After running this, load the corpus:  npm run rag:ingest

create extension if not exists vector;

-- One retrievable chunk of a curated corpus doc (src/lib/rag/corpus/*.md),
-- with its L2-normalised gemini-embedding-001 vector (768-d).
create table rag_chunks (
  id          text primary key,              -- "03-kaution-551#0" — stable across rebuilds
  doc_id      text not null,                 -- corpus file basename, "03-kaution-551"
  doc_title   text not null,
  heading     text not null,                 -- nearest enclosing markdown heading
  tags        text[] not null default '{}',
  text        text not null,
  embedding   vector(768) not null,
  created_at  timestamptz not null default now()
);

create index rag_chunks_embedding_idx
  on rag_chunks using hnsw (embedding vector_cosine_ops);
create index rag_chunks_doc_id_idx on rag_chunks (doc_id);

-- Single-row provenance record for the loaded index. `corpus_hash` lets CI /
-- the eval agent detect a corpus that changed without a re-ingest; `model` /
-- `dim` guard against silently mixing vector spaces after a model bump.
create table rag_index_meta (
  id           int primary key default 1,
  model        text not null,
  dim          int not null,
  corpus_hash  text not null,
  doc_count    int not null,
  chunk_count  int not null,
  built_at     timestamptz not null default now(),
  constraint rag_index_meta_singleton check (id = 1)
);
