-- Migration: guardrail category on findings.
-- Separates a hard compliance defect (a clause that is void / breaches a
-- statutory guardrail) from a negotiation-position flag (a playbook redline on a
-- non-critical topic). Set by the analyser from the clause-guardrail engine
-- (src/lib/guardrails + the `tier` on src/lib/clause-taxonomy.ts), NOT by the
-- model. "Error-free" for a freshly generated contract means zero 'compliance'
-- findings (issue #8).
--
-- Run:  psql "$DATABASE_URL" -f db/009_guardrail_category.sql

do $$ begin
  create type clause_category as enum ('compliance', 'negotiation', 'info');
exception when duplicate_object then null;
end $$;

alter table risk_clauses
  add column if not exists category clause_category;
