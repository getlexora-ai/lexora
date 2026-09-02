-- ============================================================
-- Lexora — Postgres schema (Railway / plain Postgres)
-- ============================================================
-- Load into Railway:
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Differences from the old supabase/schema.sql:
--   * no foreign keys to auth.users (that schema is Supabase-only) —
--     user_id / created_by / etc. are plain text columns holding Clerk
--     user IDs (e.g. "user_2ab…")
--   * no Row-Level Security / auth.uid() policies — ownership is enforced
--     in the API route handlers via the Clerk session (see src/lib/auth.ts)
--   * no storage.* bucket policies (Supabase Storage is gone; the original
--     file is referenced by contracts.file_path, wherever you choose to
--     store it)
-- ============================================================


-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================
create type risk_level        as enum ('high', 'medium', 'low');
create type clause_status     as enum ('pending', 'replaced', 'dismissed');
create type clause_source     as enum ('ai', 'user');
create type org_member_role   as enum ('owner', 'admin', 'editor', 'viewer');
create type approval_status   as enum ('pending', 'approved', 'rejected');
create type chat_role         as enum ('user', 'assistant');

-- Clause library (see db/006_clause_library.sql)
create type clause_library_source as enum ('curated', 'user', 'imported');
create type clause_posture        as enum ('preferred', 'fallback', 'walk_away');

-- Contract templates (see db/007_contract_templates.sql)
create type template_source       as enum ('curated', 'user');

-- Playbooks (see db/008_playbooks.sql)
create type playbook_source  as enum ('curated', 'user');
create type playbook_verdict as enum ('meets', 'fallback', 'redline', 'missing');

-- db/009: separates a hard compliance defect from a negotiation-position flag.
create type clause_category  as enum ('compliance', 'negotiation', 'info');


-- ============================================================
-- organisations
-- ============================================================
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references organisations (id) on delete cascade,
  user_id     text not null,
  role        org_member_role not null default 'viewer',
  primary key (org_id, user_id)
);


-- ============================================================
-- contracts
-- ============================================================
create table contracts (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  org_id          uuid references organisations (id) on delete set null,

  -- display
  name            text not null,
  contract_type   text not null default '',

  -- document content
  file_path       text,                   -- path/key of the stored original file
  extracted_text  text,                   -- LLMWhisperer raw output
  quill_delta     jsonb,                  -- live Quill editor state (rich text + highlights)

  -- risk summary
  risk_level      risk_level,
  total_issues    int not null default 0,
  issues_fixed    int not null default 0,
  issues_dismissed int not null default 0,

  -- soft delete
  deleted_at      timestamptz,

  template_id     uuid,                   -- db/007: template this contract was generated from; FK added after contract_templates
  playbook_id     uuid,                   -- db/008: last playbook analysed against; FK added after playbooks

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index contracts_user_id_idx on contracts (user_id, created_at desc);
create index contracts_org_id_idx  on contracts (org_id,  created_at desc);

-- auto-update updated_at on every row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contracts_updated_at
  before update on contracts
  for each row execute function set_updated_at();


-- ============================================================
-- risk_clauses
-- ============================================================
create table risk_clauses (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references contracts (id) on delete cascade,

  type                risk_level not null,
  clause              text not null,         -- section name e.g. "Clause 3: Limitation of Liability"
  passage             text not null,         -- verbatim excerpt from the document
  issue               text not null,         -- what is legally problematic
  suggestion          text not null,         -- original AI replacement clause
  refined_suggestion  text,                  -- set after user refines

  status              clause_status not null default 'pending',
  source              clause_source not null default 'ai',  -- 'ai' analysis or 'user' correction
  sort_order          int not null default 0,

  reference           text,                  -- db/008: German norm the finding relies on ("§ 307 BGB")
  playbook_rule_id    uuid,                  -- db/008: rule this finding breached; FK added in the playbooks section below
  verdict             playbook_verdict,      -- db/008: 'meets' | 'fallback' | 'redline' | 'missing'
  category            clause_category,       -- db/009: 'compliance' (hard/void) | 'negotiation' | 'info'

  dismissed_reason    text,                  -- why the user marked this "not an issue"
  dismissed_at        timestamptz,
  replaced_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index risk_clauses_contract_id_idx on risk_clauses (contract_id, status);


-- ============================================================
-- clause_refinements
-- ============================================================
create table clause_refinements (
  id              uuid primary key default gen_random_uuid(),
  clause_id       uuid not null references risk_clauses (id) on delete cascade,

  user_note       text not null,    -- user context e.g. "we are a UK startup"
  refined_output  text not null,    -- what Claude returned
  was_applied     bool not null default false,

  created_at      timestamptz not null default now()
);


-- ============================================================
-- contract_versions
-- ============================================================
create table contract_versions (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references contracts (id) on delete cascade,

  quill_delta      jsonb not null,
  snapshot_reason  text,             -- e.g. "After fix: Liability Cap", "Manual edit"
  created_by       text,

  created_at       timestamptz not null default now()
);

create index contract_versions_contract_id_idx on contract_versions (contract_id, created_at desc);


-- ============================================================
-- chat_messages
-- ============================================================
create table chat_messages (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts (id) on delete cascade,

  role         chat_role not null,
  content      text not null,

  created_at   timestamptz not null default now()
);

create index chat_messages_contract_id_idx on chat_messages (contract_id, created_at);


-- ============================================================
-- clause_library — reusable, statute-anchored clause WORDING.
-- Grown by db/006_clause_library.sql. Seeded from the RAG corpus'
-- Musterformulierung blocks (scripts/seed-library.mjs).
--
-- user_id NULL  => system-curated, visible to every user, immutable via the API.
-- user_id set   => owned by that Clerk user.
-- is_approved   => a licensed lawyer has reviewed this wording (RDG control).
-- ============================================================
create table clause_library (
  id              uuid primary key default gen_random_uuid(),
  user_id         text,                                    -- NULL = system-curated
  org_id          uuid references organisations (id) on delete cascade,

  -- German is the legally authoritative text; *_en is an optional mirror that
  -- keeps German statutory citations verbatim.
  title           text not null,
  content         text not null,
  title_en        text,
  content_en      text,
  summary         text,                                    -- one line, list view

  clause_type     text not null,                           -- src/lib/clause-taxonomy.ts key
  reference       text,                                    -- "§ 551 Abs. 1 BGB"
  jurisdiction    text not null default 'DE',
  contract_types  text[] not null default '{}',
  tags            text[] not null default '{}',

  source          clause_library_source not null default 'user',
  posture         clause_posture        not null default 'preferred',
  doc_ref         text,                                    -- corpus provenance; unique for curated rows

  is_approved     boolean not null default false,
  approved_by     text,
  approved_at     timestamptz,

  embedding       vector(768),                             -- gemini-embedding-001, matches rag_chunks
  embedded_at     timestamptz,

  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A curated row has no owner; every other row must have one.
alter table clause_library
  add constraint clause_library_owner_ck
  check ((source = 'curated') = (user_id is null));

create index clause_library_user_id_idx on clause_library (user_id, clause_type);
create unique index clause_library_curated_ref_idx
  on clause_library (doc_ref) where source = 'curated';
create index clause_library_type_idx
  on clause_library (clause_type) where deleted_at is null;
create index clause_library_tags_idx on clause_library using gin (tags);
create index clause_library_embedding_idx
  on clause_library using hnsw (embedding vector_cosine_ops);
create index clause_library_fts_idx on clause_library using gin (
  to_tsvector('german', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,''))
);

create trigger clause_library_updated_at
  before update on clause_library
  for each row execute function set_updated_at();


-- ============================================================
-- contract_templates — placeholder-driven contract skeletons that
-- feed the generator. Grown / created by db/007_contract_templates.sql.
-- One curated template is seeded from the RAG corpus' standard lease
-- (scripts/seed-templates.mjs).
--
-- user_id NULL  => system-curated, visible to every user, immutable via the API.
-- user_id set   => owned by that Clerk user.
-- body          => authoritative text with {{placeholders}}.
-- sections      => parallel structured index, one entry per §-clause.
-- variables     => per-placeholder metadata (label, type, maps_to, derived expr).
-- is_approved   => a licensed lawyer has reviewed this wording (RDG control).
-- ============================================================
create table contract_templates (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text,                                  -- NULL = system-curated
  org_id                uuid references organisations (id) on delete cascade,

  name                  text not null,
  name_en               text,
  description           text,

  contract_type         text not null,                         -- matches create-contract-modal CONTRACT_TYPES
  language              text not null default 'de',

  body                  text not null,                         -- authoritative, with {{placeholders}}
  body_en               text,
  sections              jsonb not null default '[]',
  variables             jsonb not null default '[]',

  source                template_source not null default 'user',
  doc_ref               text,                                  -- provenance; unique for curated rows
  based_on_contract_id  uuid references contracts (id) on delete set null,

  is_approved           boolean not null default false,
  approved_by           text,
  approved_at           timestamptz,

  tags                  text[] not null default '{}',

  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A curated row has no owner; every other row must have one.
alter table contract_templates
  add constraint contract_templates_owner_ck
  check ((source = 'curated') = (user_id is null));

create unique index contract_templates_curated_ref_idx
  on contract_templates (doc_ref) where source = 'curated';
create index contract_templates_user_idx
  on contract_templates (user_id, created_at desc) where deleted_at is null;
create index contract_templates_type_idx
  on contract_templates (contract_type) where deleted_at is null;
create index contract_templates_tags_idx on contract_templates using gin (tags);

create trigger contract_templates_updated_at
  before update on contract_templates
  for each row execute function set_updated_at();

-- Back-reference from contracts (column declared above with a -- db/007 comment;
-- the FK lives here because contract_templates is defined after contracts).
alter table contracts
  add constraint contracts_template_id_fk
  foreign key (template_id) references contract_templates (id) on delete set null;


-- ============================================================
-- clause_comments
-- ============================================================
create table clause_comments (
  id          uuid primary key default gen_random_uuid(),
  clause_id   uuid not null references risk_clauses (id) on delete cascade,
  user_id     text not null,

  content     text not null,

  created_at  timestamptz not null default now()
);


-- ============================================================
-- approval_requests + approval_decisions
-- ============================================================
create table approval_requests (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contracts (id) on delete cascade,
  requested_by  text not null,

  status        approval_status not null default 'pending',

  created_at    timestamptz not null default now()
);

create table approval_decisions (
  id                   uuid primary key default gen_random_uuid(),
  approval_request_id  uuid not null references approval_requests (id) on delete cascade,
  decided_by           text not null,

  decision             approval_status not null,
  note                 text,

  created_at           timestamptz not null default now()
);


-- ============================================================
-- rate_limits — per-key fixed-window counters for the paid
-- "compute" API routes (see src/lib/rate-limit.ts).
-- Also loadable standalone via db/003_rate_limits.sql.
-- ============================================================
create table rate_limits (
  bucket_key   text not null,          -- "analyse:ip:1.2.3.4:h" | "analyse:u:user_2ab:d"
  window_start timestamptz not null,   -- date_trunc('hour'|'day', now())
  count        int not null default 0,
  primary key (bucket_key, window_start)
);

-- Insert-only log, written only when a request is blocked. Powers the KPI.
create table rate_limit_blocks (
  id           bigint generated always as identity primary key,
  route        text not null,
  scope        text not null,          -- 'guest' | 'user'
  bucket_key   text not null,
  created_at   timestamptz not null default now()
);

create index rate_limit_blocks_created_idx on rate_limit_blocks (created_at desc);


-- ============================================================
-- playbooks + playbook_rules  (see db/008_playbooks.sql)
-- ------------------------------------------------------------
-- A playbook is a named, user-tunable set of review POSITIONS (one rule per
-- clause topic) — the structured, editable form of src/lib/analysis.ts
-- reviewPrompt(). The clause library is the wording; a playbook is the
-- acceptance criteria. Coupling: playbook_rules.preferred_clause_id.
--
-- user_id NULL => system-curated (visible to everyone, read-only via the API).
-- is_approved  => a licensed lawyer reviewed the positions (RDG control).
-- ============================================================
create table playbooks (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,                                     -- NULL = system-curated
  org_id        uuid references organisations (id) on delete cascade,

  name          text not null,
  description   text,
  contract_type text not null default '',                 -- '' = any type
  language      text not null default 'de',

  source        playbook_source not null default 'user',
  doc_ref       text,                                     -- corpus provenance; unique for curated rows
  is_default    boolean not null default false,

  is_approved   boolean not null default false,
  approved_by   text,
  approved_at   timestamptz,

  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table playbooks
  add constraint playbooks_owner_ck check ((source = 'curated') = (user_id is null));

-- At most one default per (user, contract_type); NULLs distinct => curated rows
-- are unconstrained (the seed guards curated defaults itself).
create unique index playbooks_default_idx
  on playbooks (user_id, contract_type) where is_default and deleted_at is null;
create unique index playbooks_curated_ref_idx
  on playbooks (doc_ref) where source = 'curated';
create index playbooks_user_idx
  on playbooks (user_id, created_at desc) where deleted_at is null;

create trigger playbooks_updated_at
  before update on playbooks
  for each row execute function set_updated_at();


create table playbook_rules (
  id                  uuid primary key default gen_random_uuid(),
  playbook_id         uuid not null references playbooks (id) on delete cascade,

  clause_type         text not null,                       -- src/lib/clause-taxonomy.ts key
  topic               text not null,                       -- human label, snapshot at author time
  acceptable          text not null,                       -- default-OK position
  fallback            text,                                -- tolerable compromise
  unacceptable        text not null,                       -- must be flagged (redline)
  rationale           text,
  reference           text,                                -- "§ 551 Abs. 1 BGB"

  preferred_clause_id uuid references clause_library (id) on delete set null,
  severity            risk_level not null default 'medium',
  is_required         boolean not null default false,
  sort_order          int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index playbook_rules_order_idx on playbook_rules (playbook_id, sort_order);
create index playbook_rules_type_idx  on playbook_rules (playbook_id, clause_type);

create trigger playbook_rules_updated_at
  before update on playbook_rules
  for each row execute function set_updated_at();

-- Back-references from the base tables (columns declared above with a -- db/008
-- comment; the FKs live here because playbooks/playbook_rules are defined last).
alter table contracts
  add constraint contracts_playbook_id_fk
  foreign key (playbook_id) references playbooks (id) on delete set null;
alter table risk_clauses
  add constraint risk_clauses_playbook_rule_id_fk
  foreign key (playbook_rule_id) references playbook_rules (id) on delete set null;

-- ============================================================
-- Consent events (see db/010_consent_events.sql)
-- ============================================================
-- One row per (user, policy version): the user's acceptance of the legal
-- documents in force at the time (Impressum / Privacy / Terms / DPA).
create table consent_events (
  id             bigint generated always as identity primary key,
  user_id        text not null,
  policy_version text not null,
  docs           text[] not null default '{}',
  method         text not null default 'signup',
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index consent_events_user_idx
  on consent_events (user_id, created_at desc);
create unique index consent_events_user_version_uniq
  on consent_events (user_id, policy_version);
