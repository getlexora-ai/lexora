-- ============================================================
-- Lexora — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
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
-- Must exist before contracts (foreign key)
-- ============================================================
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references organisations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        org_member_role not null default 'viewer',
  primary key (org_id, user_id)
);


-- ============================================================
-- contracts
-- ============================================================
create table contracts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  org_id          uuid references organisations (id) on delete set null,

  -- display
  name            text not null,
  contract_type   text not null default '',

  -- document content
  file_path       text,                   -- Supabase Storage path
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
-- Every refinement attempt is logged, not just the last one
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
-- Snapshot on every meaningful edit — powers Compare & History tabs
-- ============================================================
create table contract_versions (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references contracts (id) on delete cascade,

  quill_delta      jsonb not null,
  snapshot_reason  text,             -- e.g. "After fix: Liability Cap", "Manual edit"
  created_by       uuid references auth.users (id) on delete set null,

  created_at       timestamptz not null default now()
);

create index contract_versions_contract_id_idx on contract_versions (contract_id, created_at desc);


-- ============================================================
-- chat_messages
-- Per-contract conversation with the AI assistant
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
-- Approved clauses saved for reuse across contracts
-- ============================================================
create table clause_library (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
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
-- Thread comments on individual clauses (team feature)
-- ============================================================
create table clause_comments (
  id          uuid primary key default gen_random_uuid(),
  clause_id   uuid not null references risk_clauses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,

  content     text not null,

  created_at  timestamptz not null default now()
);


-- ============================================================
-- approval_requests + approval_decisions
-- ============================================================
create table approval_requests (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contracts (id) on delete cascade,
  requested_by  uuid not null references auth.users (id) on delete cascade,

  status        approval_status not null default 'pending',

  created_at    timestamptz not null default now()
);

create table approval_decisions (
  id                   uuid primary key default gen_random_uuid(),
  approval_request_id  uuid not null references approval_requests (id) on delete cascade,
  decided_by           uuid not null references auth.users (id) on delete cascade,

  decision             approval_status not null,
  note                 text,

  created_at           timestamptz not null default now()
);


-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================

-- contracts
alter table contracts enable row level security;

create policy "users can manage their own contracts"
  on contracts for all
  using  (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid());

-- risk_clauses (access via contract ownership)
alter table risk_clauses enable row level security;

create policy "users can manage clauses on their contracts"
  on risk_clauses for all
  using (
    exists (
      select 1 from contracts
      where contracts.id = risk_clauses.contract_id
        and contracts.user_id = auth.uid()
        and contracts.deleted_at is null
    )
  );

-- clause_refinements
alter table clause_refinements enable row level security;

create policy "users can manage refinements on their clauses"
  on clause_refinements for all
  using (
    exists (
      select 1 from risk_clauses
      join contracts on contracts.id = risk_clauses.contract_id
      where risk_clauses.id = clause_refinements.clause_id
        and contracts.user_id = auth.uid()
    )
  );

-- contract_versions
alter table contract_versions enable row level security;

create policy "users can manage versions on their contracts"
  on contract_versions for all
  using (
    exists (
      select 1 from contracts
      where contracts.id = contract_versions.contract_id
        and contracts.user_id = auth.uid()
    )
  );

-- chat_messages
alter table chat_messages enable row level security;

create policy "users can manage chat on their contracts"
  on chat_messages for all
  using (
    exists (
      select 1 from contracts
      where contracts.id = chat_messages.contract_id
        and contracts.user_id = auth.uid()
    )
  );

-- clause_library
alter table clause_library enable row level security;

create policy "users can manage their own clause library"
  on clause_library for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- clause_comments
alter table clause_comments enable row level security;

create policy "users can manage their own comments"
  on clause_comments for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- org_members
alter table org_members enable row level security;

create policy "users can see their own org memberships"
  on org_members for select
  using (user_id = auth.uid());


-- ============================================================
-- Storage bucket + policies
-- 1. Create the bucket manually:
--    Dashboard → Storage → New Bucket
--      Name   : contract_files
--      Public : false (private)
-- 2. Then run the SQL below to set upload/download policies
-- ============================================================

-- Users can upload files only into their own folder ({user_id}/...)
create policy "users can upload their own contract files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'contract_files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read only their own files
create policy "users can read their own contract files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'contract_files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete only their own files
create policy "users can delete their own contract files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'contract_files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
