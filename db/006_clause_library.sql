-- Migration: turn the dormant `clause_library` table into a real, Germany-only,
-- lawyer-gateable, (later) semantically-searchable clause store.
--
-- The table was defined in db/schema.sql but never referenced by any code.
-- This migration keeps it (and its existing index) and grows it.
--
-- REQUIRES db/005_rag_corpus.sql (pgvector `vector` type) to have been applied.
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/006_clause_library.sql
-- Then: npm run seed:library          (schema rows, no API key needed)
--       npm run seed:library -- --embed   (vectors, needs GEMINI_API_KEY)

create extension if not exists vector;   -- belt-and-braces; 005 already did this

-- Where a library clause came from.
do $$ begin
  create type clause_library_source as enum ('curated', 'user', 'imported');
exception when duplicate_object then null;
end $$;

-- Negotiating posture of a clause: our default ask, a tolerable compromise, or
-- a position we would walk away from. Lets a playbook rule point at the right
-- library clause for a given verdict.
do $$ begin
  create type clause_posture as enum ('preferred', 'fallback', 'walk_away');
exception when duplicate_object then null;
end $$;

alter table clause_library
  alter column user_id      drop not null,      -- NULL user_id = system-curated, visible to everyone
  alter column jurisdiction set default 'DE';   -- Germany-only product

alter table clause_library
  add column if not exists title_en    text,
  add column if not exists content_en  text,                 -- EN mirror; German citations stay verbatim
  add column if not exists summary     text,                 -- one line, for the list view
  add column if not exists reference   text,                 -- "§ 551 Abs. 1 BGB"
  add column if not exists source      clause_library_source not null default 'user',
  add column if not exists posture     clause_posture        not null default 'preferred',
  add column if not exists tags        text[] not null default '{}',
  add column if not exists doc_ref     text,                 -- "03-kaution-551" | "22-vorlage#p5" — seed idempotency
  add column if not exists is_approved boolean not null default false,   -- RDG: reviewed by a licensed lawyer
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists embedding   vector(768),          -- gemini-embedding-001, L2-normalised (matches rag_chunks)
  add column if not exists embedded_at timestamptz,
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists deleted_at  timestamptz;

-- A curated row has no owner; every other row must have one.
do $$ begin
  alter table clause_library
    add constraint clause_library_owner_ck
    check ((source = 'curated') = (user_id is null));
exception when duplicate_object then null;
end $$;

-- Re-running the seed updates rather than duplicates.
create unique index if not exists clause_library_curated_ref_idx
  on clause_library (doc_ref) where source = 'curated';

create index if not exists clause_library_type_idx
  on clause_library (clause_type) where deleted_at is null;
create index if not exists clause_library_tags_idx
  on clause_library using gin (tags);
create index if not exists clause_library_embedding_idx
  on clause_library using hnsw (embedding vector_cosine_ops);
create index if not exists clause_library_fts_idx
  on clause_library using gin (
    to_tsvector('german', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,''))
  );

drop trigger if exists clause_library_updated_at on clause_library;
create trigger clause_library_updated_at
  before update on clause_library
  for each row execute function set_updated_at();
