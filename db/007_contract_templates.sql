-- Migration: contract templates — reusable, placeholder-driven contract
-- skeletons that feed the generator. Germany-only, personal-scoped, and
-- lawyer-gateable (RDG), mirroring db/006_clause_library.sql.
--
-- A template body is authoritative TEXT with `{{placeholders}}`, plus a parallel
-- structured `sections` index (one entry per §-clause, keyed by the shared
-- taxonomy in src/lib/clause-taxonomy.ts) and a `variables` list describing each
-- placeholder (label, type, optional `maps_to` a create-contract-modal field,
-- optional `{type:"derived", expr}`).
--
-- REQUIRES db/006_clause_library.sql (the curated §-clauses the sections point at).
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/007_contract_templates.sql
-- Then: npm run seed:library && npm run seed:templates
--
-- Safe to re-run: enum creation is guarded, and every DDL below is IF NOT EXISTS.

-- Where a template came from. 'curated' rows have user_id = NULL and are
-- read-only through the API; 'user' rows are owned by a Clerk user.
do $$ begin
  create type template_source as enum ('curated', 'user');
exception when duplicate_object then null;
end $$;

create table if not exists contract_templates (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text,                                  -- NULL = system-curated
  org_id                uuid references organisations (id) on delete cascade,

  -- German is the legally authoritative text; *_en is an optional mirror that
  -- keeps German statutory citations verbatim.
  name                  text not null,
  name_en               text,
  description           text,

  contract_type         text not null,                         -- must match create-contract-modal CONTRACT_TYPES
  language              text not null default 'de',

  body                  text not null,                         -- authoritative, with {{placeholders}}
  body_en               text,
  sections              jsonb not null default '[]',           -- [{key, heading, clause_type, clause_id, required}]
  variables             jsonb not null default '[]',           -- [{key, label, type, maps_to?, group?, expr?, required?}]

  source                template_source not null default 'user',
  doc_ref               text,                                  -- provenance; unique for curated rows
  based_on_contract_id  uuid references contracts (id) on delete set null,

  is_approved           boolean not null default false,        -- RDG: reviewed by a licensed lawyer
  approved_by           text,
  approved_at           timestamptz,

  tags                  text[] not null default '{}',

  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A curated row has no owner; every other row must have one.
do $$ begin
  alter table contract_templates
    add constraint contract_templates_owner_ck
    check ((source = 'curated') = (user_id is null));
exception when duplicate_object then null;
end $$;

-- Re-running the seed updates rather than duplicates.
create unique index if not exists contract_templates_curated_ref_idx
  on contract_templates (doc_ref) where source = 'curated';

create index if not exists contract_templates_user_idx
  on contract_templates (user_id, created_at desc) where deleted_at is null;
create index if not exists contract_templates_type_idx
  on contract_templates (contract_type) where deleted_at is null;
create index if not exists contract_templates_tags_idx
  on contract_templates using gin (tags);

drop trigger if exists contract_templates_updated_at on contract_templates;
create trigger contract_templates_updated_at
  before update on contract_templates
  for each row execute function set_updated_at();

-- Which template a contract was generated from (nullable; never blocks a delete).
alter table contracts
  add column if not exists template_id uuid references contract_templates (id) on delete set null;
