-- Migration: Playbooks — a named, user-tunable set of review positions, one
-- rule per clause topic. The structured, editable form of what
-- src/lib/analysis.ts reviewPrompt() hardcodes today.
--
-- Distinct from the clause library: the library is the WORDING (parts bin);
-- a playbook is the POSITIONS / acceptance criteria (inspection spec). The only
-- coupling is playbook_rules.preferred_clause_id -> clause_library.id.
--
-- REQUIRES db/006_clause_library.sql (clause_library + its indexes) and the
-- base schema (risk_level enum, organisations, contracts, risk_clauses,
-- set_updated_at()).
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/008_playbooks.sql
-- Then: npm run seed:playbooks     (after npm run seed:library)

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type playbook_source as enum ('curated', 'user');
exception when duplicate_object then null;
end $$;

-- The per-rule outcome the analysis assigns a clause / topic.
do $$ begin
  create type playbook_verdict as enum ('meets', 'fallback', 'redline', 'missing');
exception when duplicate_object then null;
end $$;

-- ── playbooks ───────────────────────────────────────────────────────────────
create table if not exists playbooks (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,                                   -- NULL = system-curated
  org_id        uuid references organisations (id) on delete cascade,

  name          text not null,
  description   text,
  contract_type text not null default '',               -- '' = any type
  language      text not null default 'de',

  source        playbook_source not null default 'user',
  doc_ref       text,                                   -- corpus provenance; unique for curated rows
  is_default    boolean not null default false,

  is_approved   boolean not null default false,         -- RDG: a licensed lawyer reviewed the positions
  approved_by   text,
  approved_at   timestamptz,

  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A curated playbook has no owner; every other one must have one.
do $$ begin
  alter table playbooks
    add constraint playbooks_owner_ck
    check ((source = 'curated') = (user_id is null));
exception when duplicate_object then null;
end $$;

-- At most one default per (user, contract_type). NULLs are distinct, so this
-- does NOT constrain curated rows (user_id IS NULL); the seed guards curated
-- defaults itself.
create unique index if not exists playbooks_default_idx
  on playbooks (user_id, contract_type)
  where is_default and deleted_at is null;

-- Re-running the seed updates rather than duplicates.
create unique index if not exists playbooks_curated_ref_idx
  on playbooks (doc_ref) where source = 'curated';

create index if not exists playbooks_user_idx
  on playbooks (user_id, created_at desc) where deleted_at is null;

drop trigger if exists playbooks_updated_at on playbooks;
create trigger playbooks_updated_at
  before update on playbooks
  for each row execute function set_updated_at();

-- ── playbook_rules ──────────────────────────────────────────────────────────
create table if not exists playbook_rules (
  id                  uuid primary key default gen_random_uuid(),
  playbook_id         uuid not null references playbooks (id) on delete cascade,

  clause_type         text not null,                    -- src/lib/clause-taxonomy.ts key
  topic               text not null,                    -- human label, snapshot at author time
  acceptable          text not null,                    -- our default-OK position
  fallback            text,                             -- tolerable compromise
  unacceptable        text not null,                    -- must be flagged (redline)
  rationale           text,
  reference           text,                             -- "§ 551 Abs. 1 BGB"

  preferred_clause_id uuid references clause_library (id) on delete set null,
  severity            risk_level not null default 'medium',
  is_required         boolean not null default false,   -- contract is incomplete without this topic
  sort_order          int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists playbook_rules_order_idx on playbook_rules (playbook_id, sort_order);
create index if not exists playbook_rules_type_idx  on playbook_rules (playbook_id, clause_type);

drop trigger if exists playbook_rules_updated_at on playbook_rules;
create trigger playbook_rules_updated_at
  before update on playbook_rules
  for each row execute function set_updated_at();

-- ── Findings carry the rule they breached + the norm + the verdict ──────────
alter table risk_clauses
  add column if not exists reference        text,
  add column if not exists playbook_rule_id uuid references playbook_rules (id) on delete set null,
  add column if not exists verdict          playbook_verdict;

-- ── A contract remembers which playbook it was last analysed against ────────
alter table contracts
  add column if not exists playbook_id uuid references playbooks (id) on delete set null;
