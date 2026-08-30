# H6 — Database schema

_Every workflow's **§4 Database effects** links here. This chapter is the authority on what each table is, who writes it, and how long rows live._

Verified against `main` @ `bf4d660`. Source of truth: `db/schema.sql` (full load) + the numbered migrations `db/002`–`db/008`.

---

## Connection

Two `pg.Pool` instances, both against the same Neon database:

| Pool | File | `max` | Notes |
|------|------|-------|-------|
| App | `src/lib/db.ts:24` | 10 | Used by every route handler via `query()` / `queryOne()`. Strips `sslmode` / `channel_binding` from the URL and sets TLS explicitly (`src/lib/db.ts:6-16, 29`). |
| RAG / CLI | `src/lib/rag/db.ts:31-44` | 4 | Import-alias-free and self-loads `.env.local` (`src/lib/rag/db.ts:11`), so `node scripts/*.mjs` and the app can both use it. `ragQuery()` / `endRagPool()`. |

`DATABASE_URL` is the pooled (PgBouncer) endpoint; `DATABASE_URL_UNPOOLED` is direct. The app reads `DATABASE_URL`; migrations run against `DATABASE_URL_UNPOOLED`.

**`user_id` is a plain `text` column holding the Clerk user id** (`user_2ab…`). No FK to any users table — Clerk is the identity system and there is no local mirror. Ownership is enforced in the route handlers, not by the database (`db/schema.sql:8-12`). See [H1](h1-auth-and-ownership.md).

---

## <a id="migration-order"></a>Migration order

```
db/schema.sql            -- full fresh load, self-contained
db/002_user_id_to_text.sql
db/003_rate_limits.sql
db/004_clause_corrections.sql
db/005_rag_corpus.sql        -- create extension vector; rag_chunks; rag_index_meta
db/006_clause_library.sql    -- grows clause_library
db/007_contract_templates.sql
db/008_playbooks.sql
```

**`db/005` is a hard prerequisite for `db/schema.sql`.** `db/schema.sql:22` creates only `pgcrypto`, but `clause_library.embedding` is `vector(768)` (`db/schema.sql:228`) and `db/006` opens with `create extension if not exists vector`. A fresh `psql -f db/schema.sql` on a database that has never run `db/005` fails on the `vector` type. Order: `db/005` → `db/schema.sql` → `006`/`007`/`008` (or run the numbered files in sequence on a DB that already has `db/schema.sql`).

The three back-reference FKs (`contracts.template_id`, `contracts.playbook_id`, `risk_clauses.playbook_rule_id`) are declared as bare columns inside their tables and wired with trailing `alter table … add constraint` after the referenced tables exist (`db/schema.sql:322-324, 471-476`), so a top-to-bottom load succeeds.

---

## <a id="tables"></a>Table inventory — who writes each

| Table | Written by (`file:line`) | Read by | Retention |
|-------|--------------------------|---------|-----------|
| **`contracts`** | `POST /api/contracts:56` (insert); `PATCH /api/contracts/[id]:68` (name / delta / issues_fixed); `.../reanalyse:90` (total_issues, issues_fixed→0, playbook_id); `.../clauses POST:81` (total_issues+1); `.../clauses/[clauseId] PATCH:71,76,84,89` (issues_fixed / issues_dismissed counters) | dashboard list, review screen, `original` route | **Hard `DELETE`** (`.../[id]/route.ts:86`). ⚠ `deleted_at` column exists but no API path sets it — `GET`/list filter `deleted_at is null` defensively, but nothing ever soft-deletes. |
| **`risk_clauses`** | `POST /api/contracts:94` (bulk); `.../clauses POST:66` (user-added); `.../clauses/[clauseId] PATCH:63` (status / refined_suggestion); `.../reanalyse:79` (bulk, after deleting `status='pending'`) | review screen, `GET /api/contracts/[id]` | `ON DELETE CASCADE` from `contracts` (`db/schema.sql:118`) |
| **`clause_refinements`** | `.../clauses/[clauseId]/refinements POST:28`; the dead `POST /api/clauses/[clauseId]/refinements:47` | **Nothing in the UI reads it.** `GET` handlers exist, no caller. | cascade from `risk_clauses` (`:149`) |
| **`contract_versions`** | `.../versions POST:46` (one row per Apply-fix, AI edit, manual save, restore) | History tab | cascade (`:164`). ⚠ Unbounded — no pruning, one jsonb blob per snapshot. |
| **`chat_messages`** | `.../chat POST:46` (user turn and assistant turn saved separately by the client) | review chat panel on load | cascade (`:181`) |
| **`clause_library`** | `createClause` `src/lib/clause-library.ts:150`; `updateClause:216`; `softDeleteClause:213`; `scripts/seed-library.mjs:27` (curated upsert by `doc_ref`) | `/clauses`, `ClausePicker`, playbook preferred-clause picker | `deleted_at` soft delete (`src/lib/clause-library.ts:210`) |
| **`contract_templates`** | `createTemplate` `src/lib/contract-templates.ts` (POST); `updateTemplate` (PATCH); `POST /api/templates/from-contract:73`; `scripts/seed-templates.mjs` | `/templates`, create modal | `deleted_at` soft delete |
| **`playbooks`** | `createPlaybook`; `updatePlaybook` (name/description/is_default/is_approved); `clonePlaybook` (`POST /api/playbooks/[id]/clone`); `scripts/seed-playbooks.mjs` | `/playbooks`, review Playbook tab, analysis | `deleted_at` soft delete |
| **`playbook_rules`** | `insertRule` (`POST /api/playbooks/[id]/rules`); `updateRule` (PATCH); `deleteRule` (**hard** `DELETE`); seed replaces all rules in a txn | rule editor, analysis prompt builder | cascade from `playbooks`; individual rules hard-deleted |
| **`rate_limits`** | `bump()` `src/lib/rate-limit.ts:41` — 4 upserts per gated request | `enforceRateLimit` | 1 % chance per request of `delete … where window_start < now() - interval '2 days'` (`src/lib/rate-limit.ts:118`) |
| **`rate_limit_blocks`** | `enforceRateLimit` `src/lib/rate-limit.ts:102` — insert only when a request is blocked | the only KPI query surface today | **Never pruned.** ⚠ `scope` column comment says `'guest' | 'user'` but the code always writes `'user'` (`:103`). |
| **`rag_chunks`** | `saveIndex()` `src/lib/rag/store.ts:81` — `delete` + bulk `insert` in one transaction (`:78-95`) | `queryIndex()` cosine search | Replaced wholesale by `npm run rag:ingest` |
| **`rag_index_meta`** | `saveIndex()` `src/lib/rag/store.ts:87` — single-row upsert (`id = 1`) | `assertIndexFresh()` guard | one row, overwritten each ingest |
| `organisations`, `org_members`, `clause_comments`, `approval_requests`, `approval_decisions` | **Nothing.** Roadmap tables — schema kept per `docs/product-audit.md`, zero code references. | — | — |

---

## Core tables in detail

### `contracts` (`db/schema.sql:66-94`)

One row per analysed or generated contract.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `user_id` | text **not null** | Clerk id. Ownership key. |
| `org_id` | uuid → organisations | Always null (orgs unbuilt). |
| `name` | text not null | The filename (upload) or the modal's "Contract Name" (generate). |
| `contract_type` | text not null default `''` | ⚠ **Two vocabularies** — the upload modal sends lowercase codes (`lease`, `nda`); the generate modal and `src/lib/contract-types.ts` use display names (`"Lease Agreement"`). |
| `file_path` | text | Storage key of the original upload, or null. See [H7](h7-storage.md). |
| `extracted_text` | text | LLMWhisperer output (upload) or the raw generated draft (generate). The seed for Quill and the input to re-analyse / chat / refine. |
| `quill_delta` | jsonb | Live editor state, incl. green fix highlights. Overwritten on every autosave and every Apply-fix. |
| `risk_level` | risk_level | Roll-up: `high` if any clause is high, else `medium` if any medium, else `low` (`src/app/analysis/page.tsx:196-201`). Generate path hardcodes `'low'` (`dashboard/page.tsx:452`). |
| `total_issues` | int default 0 | Count at insert; `+1` per user-added clause; reset on re-analyse. |
| `issues_fixed` | int default 0 | `+1` per Apply-fix (server-side, on the clause status change). Reset to 0 on re-analyse. |
| `issues_dismissed` | int default 0 | `+1` per dismiss; `-1` (floored at 0) on un-dismiss. ⚠ **not** selected by `GET /api/contracts/[id]` (`.../[id]/route.ts:15-16`), so the review screen can't show a dismissed tally. ⚠ not reset on re-analyse. |
| `deleted_at` | timestamptz | Exists, never written. |
| `template_id` | uuid → contract_templates | ⚠ Column + FK exist and `POST /api/contracts` accepts `template_id` (`route.ts:33,66`), but the generate client never sends it — `/api/generate` returns `templateId` in its body and the save flow drops it. |
| `playbook_id` | uuid → playbooks | Set by re-analyse when a playbook was used; set at insert by the analysis-page save when `playbook.id` came back. |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by trigger `contracts_updated_at` (`:108`). |

### `risk_clauses` (`db/schema.sql:116-139`)

One row per flagged clause (AI or user-added).

| Column | Type | Notes |
|--------|------|-------|
| `contract_id` | uuid → contracts **cascade** | |
| `type` | risk_level not null | high / medium / low. |
| `clause` | text not null | Section name, e.g. `"§ 5 Kaution"`. |
| `passage` | text not null | Verbatim excerpt the AI must copy (≤ 80 chars per the prompt). The anchor `findPassage` searches for. |
| `issue` | text not null | What's legally wrong, with an inline norm cite. |
| `suggestion` | text not null | The AI's replacement clause. |
| `refined_suggestion` | text | Set by Refine (C5) or "Insert from library" (C6); the review screen shows `refined_suggestion ?? suggestion` (`src/app/review/page.tsx:255`). |
| `status` | clause_status default `pending` | `pending` → `replaced` (Apply fix) or `dismissed`. Reload shows only `pending` + `dismissed`. |
| `source` | clause_source default `ai` | `user` for AI-missed clauses added in the review screen. |
| `sort_order` | int | Display order. |
| `reference` | text | db/008 — the German norm (`"§ 307 BGB"`). Persisted only on the re-analyse path and the analysis-page save; the plain `/api/analyse` → save path also carries it. |
| `playbook_rule_id` | uuid → playbook_rules | db/008 — which rule this finding graded against. Drives the review-tab verdict chip. |
| `verdict` | playbook_verdict | `meets` / `fallback` / `redline` — the model's grade against `playbook_rule_id`. |
| `dismissed_reason`, `dismissed_at`, `replaced_at` | | audit timestamps. |

### `contract_versions` (`db/schema.sql:162-171`)

Immutable snapshots. `quill_delta` (jsonb, not null) + `snapshot_reason` (free text: `"Applied fix: …"`, `"Manual save"`, `"Restored version from …"`, `"Added from playbook: …"`) + `created_by` (Clerk id). The list endpoint omits `quill_delta` to stay light; the single-version endpoint returns it for a restore.

---

## Feature tables

### `clause_library` (`db/schema.sql:201-255`, grown by `db/006`)

Reusable clause **wording**. `title` / `content` are the German-authoritative fields (not null); `title_en` / `content_en` are an optional mirror. Key columns: `clause_type` (a [taxonomy](../../src/lib/clause-taxonomy.ts) key), `reference` (statute), `posture` (`preferred` / `fallback` / `walk_away`), `source` (`curated` / `user` / `imported`), `doc_ref` (corpus provenance — unique for curated rows), `is_approved` + `approved_by` + `approved_at` (RDG lawyer-review gate), `embedding vector(768)` + `embedded_at`.

- **Check constraint** `clause_library_owner_ck`: `(source = 'curated') = (user_id is null)` (`:237-239`). A curated row has no owner; every other row must have one.
- **Indexes**: HNSW cosine on `embedding` (`:247`), GIN FTS on `to_tsvector('german', title || summary || content)` (`:249`), GIN on `tags`, partial unique on `doc_ref where source='curated'`.
- ⚠ **`createClause` writes no `embedding`** (`src/lib/clause-library.ts:150-164`). Only `scripts/seed-library.mjs -- --embed` populates vectors, and only for curated rows. Semantic search (`… where embedding is not null`) therefore never returns a user's own clauses.

### `contract_templates` (`db/schema.sql:271-318`, `db/007`)

Contract skeletons. `body` (text, not null) is authoritative with `{{placeholders}}`; `sections` (jsonb) is a parallel structured index (one entry per §-clause: `{key, heading, clause_type, clause_id, required}`); `variables` (jsonb) is per-placeholder metadata (`{key, label, type, required, maps_to, group, expr}`). Same `source` / `doc_ref` / `is_approved` / owner-check pattern as `clause_library`. `based_on_contract_id` → contracts (set null) for templates saved from a contract.

### `playbooks` + `playbook_rules` (`db/schema.sql:401-476`, `db/008`)

Review **positions**. A `playbook` is `{name, contract_type ('' = any), language, source, doc_ref, is_default, is_approved}`. Each `playbook_rules` row is one topic's position: `acceptable` / `fallback` / `unacceptable` (all the model sees), `rationale`, `reference`, `severity`, `is_required`, `sort_order`, and `preferred_clause_id` → `clause_library` (set null) — the single edge between the two feature areas.

- **Partial unique** `playbooks_default_idx` on `(user_id, contract_type) where is_default and deleted_at is null` (`:429`). NULLs are distinct, so **curated playbooks (`user_id is null`) are unconstrained** — the seed sets `is_default = false` and relies on that.
- ⚠ A curated playbook **can never be the resolved default** — `resolvePlaybookForAnalysis` requires `user_id = $1` (`src/lib/playbooks.ts:156`). Out of the box no playbook applies until a user clones one (F2) and sets it default (F4).
- ⚠ **Playbook coverage has no table.** `coverage` is computed per analysis and returned to the client (`src/app/api/analyse/route.ts:40-44`), never persisted. Reload the review screen and the Playbook tab's coverage list is empty until the next re-analyse.

### `rag_chunks` + `rag_index_meta` (`db/005`)

`rag_chunks`: `id` (text, `"03-kaution-551#0"`), `doc_id`, `doc_title`, `heading`, `tags text[]`, `text`, `embedding vector(768)` — HNSW cosine index. `rag_index_meta`: single row (`id = 1`) with `model` / `dim` / `corpus_hash` / `doc_count` / `chunk_count` / `built_at`, guarding the retrieval path against a model/dim mismatch (`src/lib/rag/store.ts:assertIndexFresh`). See [H4](h4-rag-pipeline.md).

### `rate_limits` + `rate_limit_blocks` (`db/003`)

See [H2](h2-rate-limiting.md#tables).

---

## Enums (`db/schema.sql:27-43`)

`risk_level` (high/medium/low) · `clause_status` (pending/replaced/dismissed) · `clause_source` (ai/user) · `org_member_role` (owner/admin/editor/viewer, unused) · `approval_status` (pending/approved/rejected, unused) · `chat_role` (user/assistant) · `clause_library_source` (curated/user/imported) · `clause_posture` (preferred/fallback/walk_away) · `template_source` (curated/user) · `playbook_source` (curated/user) · `playbook_verdict` (meets/fallback/redline/missing).

---

## Cross-cutting notes for §4 authors

- **`POST /api/contracts` is not transactional** (`route.ts:54-70` insert, then `:92-99` bulk clause insert). A failure between them leaves a `contracts` row with `total_issues = N` and zero `risk_clauses`.
- **Counter drift is possible everywhere.** `issues_fixed` / `issues_dismissed` / `total_issues` are maintained by `+1` / `-1` UPDATEs in separate statements from the row change they track, never recomputed from `risk_clauses`.
- **`created_by` on `contract_versions` and `approved_by` on the feature tables** are the closest thing to an audit actor column; no table has a general `updated_by`.
