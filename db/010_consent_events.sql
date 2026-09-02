-- Migration: record of consent captured at (and after) sign-up.
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/010_consent_events.sql
--
-- One row per (user, policy version): the user's acceptance of the legal
-- documents in force at the time. Bumping POLICY_VERSION in
-- src/lib/legal/policies.ts is what makes a fresh row get written.

create table if not exists consent_events (
  id             bigint generated always as identity primary key,
  user_id        text not null,                 -- Clerk user id
  policy_version text not null,                  -- POLICY_VERSION at acceptance
  docs           text[] not null default '{}',  -- e.g. {terms,privacy,dpa}
  method         text not null default 'signup',-- 'signup' | 'reprompt' | 'settings'
  ip             text,                           -- best-effort client IP
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists consent_events_user_idx
  on consent_events (user_id, created_at desc);

-- Repeated page loads must not pile up rows for the same version.
create unique index if not exists consent_events_user_version_uniq
  on consent_events (user_id, policy_version);
