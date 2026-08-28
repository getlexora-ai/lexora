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
create type org_member_role   as enum ('owner', 'admin', 'editor', 'viewer');
create type approval_status   as enum ('pending', 'approved', 'rejected');
create type chat_role         as enum ('user', 'assistant');


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

  -- soft delete
  deleted_at      timestamptz,

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
  sort_order          int not null default 0,

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
-- clause_library
-- ============================================================
create table clause_library (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  org_id          uuid references organisations (id) on delete cascade,

  title           text not null,
  clause_type     text not null,
  content         text not null,
  jurisdiction    text not null default 'Global',
  contract_types  text[] not null default '{}',

  created_at      timestamptz not null default now()
);

create index clause_library_user_id_idx on clause_library (user_id, clause_type);


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
