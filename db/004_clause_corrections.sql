-- Migration: let users correct the AI contract analysis.
-- Dismiss false-positive clauses and add clauses the AI missed.
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/004_clause_corrections.sql

-- Where a risk clause came from: the AI analysis, or a human correction.
create type clause_source as enum ('ai', 'user');

alter table risk_clauses add column source           clause_source not null default 'ai';
alter table risk_clauses add column dismissed_reason text;
alter table risk_clauses add column dismissed_at     timestamptz;

alter table contracts    add column issues_dismissed int not null default 0;
