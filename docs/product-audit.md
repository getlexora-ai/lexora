# Lexora — Product Shortcomings Audit

_Verified against the codebase on 2026-08-30. Each finding cites file:line evidence._

Product direction (confirmed 2026-08-30): **Germany-only, curated**. Contracts are
German-law grounded; output language is **English or German**. All other
jurisdictions are being removed from the UI.

---

## 🔴 Critical

### C1 — "Apply fix" silently no-ops when the AI's passage doesn't match the document
`review/page.tsx` `handleReplace`: `findPassage(text, card.passage)` returns null
when the LLM paraphrased/truncated the passage (`analysis.ts` caps it: *"passage
must be copied verbatim… max 80 chars"*). The replace was guarded by `if (match)`
but the clause was **unconditionally** marked `replaced`, removed, and
`issues_fixed` incremented — so a contract could read "issue fixed" with the
risky clause still in it.
**Status: FIXED (2026-08-30).** On no match: keep the card, surface a notice, add
a Copy button on the suggested wording; nothing is marked fixed.
**Follow-up:** anchor clauses by character offset captured at analysis time
instead of re-searching text.

### C2 — Uploaded originals are discarded
`api/extract/route.ts` — `const filePath: string | null = null;` // *"Original-file
storage was dropped in the move off Supabase."* `analysis/page.tsx` clears the
in-memory file after analysis. Only lossy `layout_preserving` text remains.
No "view source", no re-OCR, no diff-to-original, no evidence trail; a faithful
export cannot reproduce the source.
**Plan:** Wave B #6 — pluggable `lib/storage.ts`, persist `file_path`, disabled
until a bucket is configured (no S3/R2 creds in the env today).

### C3 — Compute routes open to anonymous users + limiter fails open
`auth-gate.test.mjs` asserts `analyse/generate/extract/refine/chat` serve guests
by design. `rate-limit.ts` — *"Fails open — a limiter/DB outage must not break
analysis."* Guest bucket is first-XFF-hop IP, trivially rotated.
**Decision: HARD AUTH-GATE.** Compute routes require a signed-in Clerk user.
No anonymous AI. Every request attributable → billing caps + audit trail.
**Plan:** Wave B #3.

---

## 🟡 Half-built — roadmap, keep the schema

Decision 2026-08-30: **keep all of it, it's the roadmap** — not yet built for
lack of time. Do not drop the unused tables.

| # | Feature | Evidence | State |
|---|---|---|---|
| H1 | **Export** | `review/page.tsx` `<Button>Export</Button>` — no `onClick` | Wave C #2 — DOCX **and** PDF |
| H2 | Compare / History / Approval tabs | `NAV_TABS`; `setActiveTab` only drives `aria-selected` | History wired in Wave C #4; Compare/Approval later |
| H3 | Version history | `contract_versions` + `GET/POST /api/contracts/[id]/versions` exist; frontend never POSTs a snapshot | Wave C #4 |
| H4 | Orgs / approval / clause library / comments | `organisations`, `org_members`, `approval_requests`, `approval_decisions`, `clause_library`, `clause_comments` — 0 code refs; role/status enums defined | Roadmap — keep tables |
| H5 | Sidebar: Clause library, Templates, Playbooks, Risk dashboard, Activity | render with `SOON` tag | Roadmap |

**Clause library seed material already exists:** every RAG corpus doc has a
`Musterformulierung` (model clause); `src/lib/rag/corpus/22-standard-wohnraum­miet­vertrag-vorlage.md`
is a full annotated clause set (§1 Mietobjekt … §10). Pre-populate `clause_library`
from those when that feature is built.

---

## ⚖️ Legal-domain

- **L1 — Analysis has no citations.** `analysis.ts` `REVIEW_PROMPT` produces
  `issue` + `suggestion` with no statute/case anchor. The German RAG generation
  path grounds and cites; analysis does not. **Plan: Wave B #5** extends grounding
  to analysis.
- **L2 — Jurisdiction-blindness → resolved by scope.** Product is Germany-only
  now; `/api/analyse` and `/api/generate` assume DE. A **Language** selector
  (EN/DE) replaces the jurisdiction dropdown. **Plan: Wave B #5.**
- **L3 — RDG exposure.** `RdgStrip` disclaimer is passive, not a workflow gate.
  The unbuilt `approval_requests` table is the "reviewed by a lawyer" control.
  Revisit when approval workflow is built.
- **L4 — No audit trail.** `quill_delta` is overwritten; no immutable event log.
  `contract_versions` is the backbone. **Plan: Wave C #4.**

---

## 🏗 Architecture / data debt

- **A1 — Dual state (localStorage ↔ Postgres).** `contract-store.ts` mirrors
  contracts + delta + remaining clauses into `localStorage`; `review/page.tsx`
  reconciles `localStorage ?? memory ?? DB`. `handleReplace` does 3 un-transacted
  writes. **Plan: Wave C #7** — DB as source of truth, localStorage only for the
  unsaved/guest case.
- **A2 — Two Gemini clients** (`lib/llm.ts`, `lib/rag/gemini.ts`) — see
  `src/lib/rag/FEEDBACK.md`.
- **A3 — No CI.** No `.github/workflows`. Tests + build + lint + `rag:eval` run
  only manually.
- **A4 — `contract-edit` parses the regenerated doc by `split("---EXPLANATION---")`**
  — brittle.
- **A5 — Silent truncation:** `analyseContract` 200k chars, `chat` 20k,
  `refine` 8k — no user signal, inconsistent caps.

---

## ✅ Works — build on it

Core loop (upload → extract → structured analysis with `responseSchema` + retry
→ inline highlight-and-replace); the German RAG path (grounded, live); rate-limit
design (tiers + `rate_limit_blocks` KPI); ownership checks (`ownsContract` /
`ownsClause`); error taxonomy (`AppError` / `errorResponse`); "correct the AI"
affordances (dismiss-with-reason, add-missed-clause).

---

## Execution plan — all shipped 2026-08-30

**Wave A** ✅ — C1 fix · this document.

**Wave B** ✅ (parallel worktree agents, merged sequentially):
- #3 — hard auth-gate: `src/proxy.ts` 401s a signed-out POST to any compute
  route (analyse/generate/extract/refine/chat/contract-edit + reanalyse);
  `rate-limit.ts` simplified to user-keyed buckets only.
- #5 — Germany-only: jurisdiction dropdown → EN/DE Language select; grounded
  DE-law analysis with inline statute citations (`reviewPrompt(language)`,
  optional `reference` field — not yet a DB column); `language` threaded through
  generate + RAG.
- #6 — `src/lib/storage.ts`: `none` / `fs` / `s3`-stub drivers, off by default
  (no bucket creds); `extract` persists `file_path`; owner-gated
  `GET /api/contracts/[id]/original`.

**Wave C** ✅ (serial):
- #7 — deleted `src/lib/contract-store.ts`; the review screen loads and writes
  only Postgres. Fixed a latent bug (selection-refine edits were localStorage-only).
- #4 — snapshots on every applied fix / AI edit / manual save; new
  `GET /api/contracts/[id]/versions/[versionId]`; History tab lists + restores.
- #2 — Export button → Word/PDF menu; `src/lib/export-contract.ts` builds a
  `.docx` (real headings/bold/lists) and text-forward `.pdf` from the Quill
  Delta. `next.config.ts` aliases jspdf's unused optional deps.

### Known follow-ups
- `reference` (statute citation per clause) is returned by `/api/analyse` but not
  persisted — needs a `risk_clauses.reference` column + migration.
- Old contracts saved before the Markdown fix keep literal `**`/`#` in their
  stored delta (only new drafts render); a one-off re-render/migration could fix.
- Object storage `s3` driver is a throwing stub — implement or wire `fs` + a bucket.
- Rate-limit integration test skipped pending an authenticated-session rewrite.
- Compare / Approval tabs still "coming soon"; orgs/clause-library/playbooks/
  risk-dashboard/activity remain roadmap (schema kept).
