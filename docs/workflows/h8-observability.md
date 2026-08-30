# H8 — Observability

_What the running system tells you, what it doesn't, and the cheapest path from here. Every workflow file ends with a **§9 Observability notes** block whose gap table feeds the register below; the ids here (`C4-O1`, `H5-O2`, …) are those ids, verbatim._

Verified against `main` @ `bf4d660`.

---

## 1 · What exists today

The honest summary: **almost nothing.** A production incident today is reconstructed from the user's screenshot and a re-read of the code.

- **26 `console.*` calls in all of `src/`** — **24 `console.error`**, **2 `console.warn`**, and **zero** `console.info` / `console.log` / `console.debug`. The 2 warns are both boot-time storage-config checks (`src/lib/storage.ts:84`, `:176`). Every other emission is an error path. A clean run — an upload analysed, a fix applied, a contract exported — writes **not one log line**.
- **No timing, anywhere.** There is no `Date.now()` / `performance.now()` bracketing a DB query, an LLM call, OCR, or a route handler. Every "latency unknown" / "how slow is X" gap in the register traces back to this single absence.
- **No analytics.** No pageview beacon, no event pipeline, no funnel instrumentation, no client-side product metrics at all (`A1-O1`). The landing demo, the sign-up funnel, and every in-app action are uncounted.
- **One almost-structured logger:** `errorResponse(err, context)` (`src/lib/errors.ts:25-34`) emits a single `console.error("[<context>]", err)` on the non-`AppError` branch, then flattens to a generic 500. It carries a hand-passed `context` tag and nothing else — no route, no `userId`, no request id, no duration.
- **`errorResponse` is used by 8 of 31 route files** — `analyse`, `chat`, `clause-library/search`, `contract-edit`, `extract`, `generate`, `refine`, `templates/suggest-variables` (the compute routes). The **other 23** route files use the ad-hoc pattern `catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }) }` — they leak the raw Postgres message to the browser **and** log nothing (`H3-O2`).
- **The only durable runtime signal is the `rate_limit_blocks` table.** One row is inserted per 429 (`src/lib/rate-limit.ts:108`, fire-and-forget with an empty `.catch` — `H2-O3`). It is the sole persisted evidence that anything happened in prod. There is **no** `compute_calls` table, no request log, no error table, no `seed_runs` table, no token/cost ledger.

### The 26 emissions, by file

| file | `error` | `warn` | covers |
|------|-------:|------:|--------|
| `src/app/review/page.tsx` | 15 | 0 | autosave, chat-save, apply-fix, refine, snapshot, restore, re-analyse, dismiss, add-clause — all client-side, all id-less strings |
| `src/lib/llm.ts` | 3 | 0 | `askLLM` config / transport / parse failures |
| `src/app/api/extract/route.ts` | 3 | 0 | `putOriginal` throw, missing `whisper_hash`, non-200/202 submit |
| `src/lib/storage.ts` | 0 | 2 | driver misconfig at boot |
| `src/lib/errors.ts` | 1 | 0 | the `errorResponse` non-`AppError` branch — the closest thing to a shared logger |
| `src/lib/rate-limit.ts` | 1 | 0 | fail-open catch (rate-limit backend unreachable) |
| `src/app/(workspace)/dashboard/page.tsx` | 1 | 0 | `[generate]` catch in `onGenerate` |

Nothing in `src/app/api/**` besides `extract` logs on its own; the compute routes rely entirely on `errorResponse`, and the CRUD routes on nothing.

---

## 2 · The classification rubric — six classes

Every gap is one of these (defined in [00-conventions](00-conventions.md#the-classification-rubric-six-classes)):

| Class | Definition |
|-------|------------|
| **NO-LOG** | The path emits nothing on either the success or the interesting-failure branch. |
| **THIN-LOG** | Something is logged, but without the identifiers to act on it — no user id, contract id, route, or duration. |
| **SILENT-CATCH** | An error is caught and discarded, or swallowed into a fallback that looks like success. |
| **NO-TRACE-CORRELATION** | Multiple hops in one user action share no id, so the sequence can't be reconstructed. |
| **NO-METRIC** | The quantity exists conceptually but nothing counts it. |
| **LEAK** | The system over-emits — raw internals reach the client. |

Compound classes (`LEAK + NO-LOG`, `NO-LOG + SILENT-CATCH`, `THIN-LOG + NO-METRIC`, `NO-METRIC + SILENT-CATCH`) are used verbatim where a single gap is two things at once.

## 3 · The fix tiers

Proposals are ordered by cost, not by value:

- **Tier 0** — one-line `console.info` (or `console.warn`) with a stable event name. No new files, no dependencies, no schema. A `grep` on the event name is the query.
- **Tier 1** — a `src/lib/log.ts` shim emitting single-line JSON, plus an `x-lexora-op-id` request/op id threaded through a user action so its hops correlate. Also: fold a non-transactional write pair into a transaction and log the rollback.
- **Tier 2** — durable counters in Postgres, following the `rate_limit_blocks` pattern: `compute_calls`, `seed_runs`, `contract_playbook_coverage`, `clause_approval_events`, `playbook_approvals`. Queryable history, survives a restart.
- **Tier 3** — OpenTelemetry / an external APM (traces, spans, RED metrics). Named and deferred; only `A1-O1` even mentions it, and only as one option.

---

## 4 · The register

Every §9 gap, across all workflow files, sorted by tier then id. **178 gaps: 127 tier-0, 30 tier-1, 16 tier-2, 5 unclassed** (design/code debt with no observability fix).

| Family | tier 0 | tier 1 | tier 2 | — | total |
|--------|------:|------:|------:|--:|------:|
| A — identity & entry | 4 | 3 | 0 | 3 | 10 |
| B — getting a contract in | 20 | 3 | 2 | 0 | 25 |
| C — the review screen | 44 | 10 | 3 | 0 | 57 |
| D — clause library | 12 | 2 | 6 | 1 | 21 |
| E — templates | 13 | 4 | 1 | 1 | 19 |
| F — playbooks | 10 | 2 | 2 | 0 | 14 |
| G — dashboard & workspace | 11 | 0 | 0 | 0 | 11 |
| H1 — auth & ownership | 3 | 0 | 0 | 0 | 3 |
| H2 — rate limiting | 3 | 1 | 0 | 0 | 4 |
| H3 — error taxonomy | 1 | 2 | 0 | 0 | 3 |
| H4 — RAG pipeline | 2 | 2 | 0 | 0 | 4 |
| H5 — LLM layer | 3 | 1 | 1 | 0 | 5 |
| H7 — storage | 1 | 0 | 1 | 0 | 2 |
| **total** | **127** | **30** | **16** | **5** | **178** |

### Tier 0 — one `console.info`/`console.warn` line each

| id | Blind spot | Class |
|----|-----------|-------|
| A1-O1 | Zero web analytics | NO-METRIC |
| A2-O1 | Demo engagement unmeasured | NO-METRIC |
| A3-O2 | `/welcome` prints the raw Clerk user id to the user | LEAK (minor) |
| A7-O1 | Guest → compute → 401 bounce uncounted | NO-METRIC |
| B1-O1 | No funnel signal for "started an upload" | NO-METRIC |
| B2-O1 | OCR latency + poll count unknown | NO-METRIC |
| B2-O2 | Function-timeout vs. poll-timeout indistinguishable | NO-LOG |
| B2-O3 | Storage side-effect result invisible on success | NO-LOG |
| B3-O1 | No log of a successful analysis (count, ms, chars, truncated?) | NO-LOG |
| B3-O2 | Retry / `analysis_failed` rate unknown | NO-METRIC |
| B3-O3 | Truncation silent | NO-LOG |
| B4-O1 | Playbook resolution result unlogged | NO-LOG |
| B4-O3 | Rule-block truncation silent | NO-LOG |
| B5-O2 | Raw DB error leaked, not logged | LEAK + NO-LOG |
| B5-O3 | Temp-id remap mismatch silent | NO-LOG |
| B6-O1 | No generation funnel (started / generated / saved) | NO-METRIC |
| B6-O2 | Generate-ok-save-fail loses the draft with no trace | NO-LOG + SILENT-CATCH |
| B7-O1 | `grounded: false` fallback invisible | NO-LOG |
| B7-O3 | Stale/empty index only shows as a generic 500 | THIN-LOG |
| B8-O1 | Silent "template not found → proceed anyway" | SILENT-CATCH |
| B8-O2 | Template usage uncounted | NO-METRIC |
| B9-O1 | Contracts saved with literal `{{vars}}` still in them | NO-METRIC |
| B9-O2 | `evalExpr` throw shape | THIN-LOG |
| B10-O1 | Prod usage of a test button unknown | NO-METRIC |
| C1-O1 | Silent-blank re-open (404 / not-owned) looks like an empty contract | SILENT-CATCH |
| C1-O2 | Review-load latency + payload shape unknown | NO-METRIC |
| C1-O3 | Chat-history restore failure swallowed | SILENT-CATCH |
| C1-O4 | Handler `catch` leaks the raw DB message, unlogged | LEAK + NO-LOG |
| C2-O1 | "Analysis lost to refresh" is invisible | NO-METRIC |
| C2-O2 | Can't tell in-memory vs DB open apart in any signal | NO-TRACE-CORRELATION |
| C3-O1 | Autosave failures only `console.error`, never surfaced or counted | THIN-LOG + NO-METRIC |
| C3-O2 | No success signal → can't measure save latency or delta size over time | NO-METRIC |
| C3-O4 | 401 (expired session) mid-edit looks identical to a network blip | THIN-LOG |
| C4-O1 | Partial-write state (UI vs DB divergence) invisible until reload | NO-METRIC + SILENT-CATCH |
| C4-O2 | Apply-fix no-match abort rate unknown | NO-METRIC |
| C4-O3 | No happy-path event → no Apply-fix volume, no fix/dismiss/add funnel | NO-LOG |
| C4-O5 | Client `console.error`s omit contract/clause id | THIN-LOG |
| C5-O1 | No successful-refine event (count, ms, contextLen, truncated?) | NO-LOG |
| C5-O3 | Which follow-up write failed is only in a generic client string | THIN-LOG |
| C5-O4 | 8 000-char truncation silent | NO-LOG |
| C6-O1 | Library-insert usage + search-mode split unknown | NO-METRIC |
| C7-O1 | Bank-to-library usage uncounted | NO-METRIC |
| C7-O2 | Imported clauses never embedded, and nothing says so | SILENT-CATCH |
| C7-O4 | Raw DB error leaked, unlogged | LEAK + NO-LOG |
| C8-O1 | Dismissal rate + reasons unsurfaced (the false-positive KPI) | NO-METRIC |
| C8-O3 | Non-persisting dismiss only `console.error`s | THIN-LOG |
| C9-O1 | "AI missed this" additions uncounted — the under-flagging KPI | NO-METRIC |
| C9-O3 | Raw DB error leaked, unlogged | LEAK + NO-LOG |
| C10-O1 | No chat-usage metric (turns, ms, historyLen) | NO-LOG |
| C10-O3 | Turn-save failures leave gaps, only `console.error`d | THIN-LOG |
| C11-O1 | Uncapped input size unmeasured | NO-METRIC |
| C11-O2 | `---EXPLANATION---` split failure invisible | NO-LOG |
| C11-O3 | Step-9 persist failure fully swallowed (`.catch(() => {})`) | SILENT-CATCH |
| C11-O4 | No AI-edit event (count, ms, inLen, outLen) | NO-LOG |
| C12-O1 | Selection-refine indistinguishable from card refine in logs | THIN-LOG |
| C12-O2 | `indexOf` miss / duplicate-hit silent | NO-METRIC |
| C13-O1 | `contract_versions` unbounded, ungauged | NO-METRIC |
| C13-O2 | Snapshot-write failures leave silent gaps in History | THIN-LOG |
| C13-O3 | Restore usage unmeasured | NO-LOG |
| C14-O2 | Path (plain vs playbook), delete count, insert count all unlogged | NO-LOG |
| C14-O3 | `language` silently forced to `de` (client never sends it) | THIN-LOG |
| C15-O2 | "Insert preferred clause" usage uncounted | NO-METRIC |
| C15-O4 | `redline`-row "View" that finds no clause is silent | NO-LOG |
| C16-O1 | Zero export telemetry (it's a pure client action) | NO-METRIC |
| C16-O2 | Lazy-chunk load failure looks the same as a render bug | THIN-LOG |
| C17-O1 | `findPassage` miss rate unknown (silent `return`) | NO-METRIC |
| C17-O2 | Exact vs normalised-fallback hit ratio unknown — proxy for AI verbatim-copy quality | NO-METRIC |
| C17-O3 | Duplicate-occurrence highlights are invisible | NO-LOG |
| D1-O1 | No browse/filter telemetry | NO-METRIC |
| D1-O2 | Raw DB error leaked, not logged | LEAK + NO-LOG |
| D1-O3 | Silently-dropped unknown `type` filter | NO-LOG |
| D2-O1 | Zero-result queries invisible | NO-METRIC |
| D2-O2 | No signal that the unindexed `ILIKE` scan is the slow path | NO-METRIC |
| D3-O1 | Silent semantic→lexical degradation (empty `catch`) | SILENT-CATCH |
| D3-O2 | Semantic-search success unlogged (mode, hits, ms) | NO-METRIC |
| D3-O4 | Re-rank effect (pos change vs raw cosine) invisible | NO-METRIC |
| D4-O1 | No write telemetry (create/edit/delete counts) | NO-METRIC |
| D4-O2 | Raw DB error leaked + unlogged on all three routes | LEAK + NO-LOG |
| D4-O3 | Curated-write 403s not counted (UI-bug canary) | NO-METRIC |
| D5-O2 | Approval toggle not logged | NO-LOG |
| E1-O1 | No browse/filter telemetry | NO-METRIC |
| E1-O2 | Raw DB error leaked, not logged | LEAK + NO-LOG |
| E1-O3 | `ILIKE` search cost unmeasured | NO-METRIC |
| E2-O1 | No preview-open signal | NO-METRIC |
| E3-O1 | Render-vs-generate branch ratio uncounted | NO-METRIC |
| E3-O2 | Key-terms box silently changing the branch (and the cost) | NO-LOG |
| E3-O3 | `[generate]` error log doesn't say render or generate | THIN-LOG |
| E4-O1 | No write telemetry | NO-METRIC |
| E4-O2 | Raw DB error leaked + unlogged on all three routes | LEAK + NO-LOG |
| E4-O4 | Curated-write 403s not counted | NO-METRIC |
| E5-O2 | `from-contract` logs nothing and leaks the raw DB message | LEAK + NO-LOG |
| E5-O3 | suggest-variables: proposed-vs-kept variable count invisible | NO-METRIC |
| E5-O4 | Double-replacement / overlapping-literal corruption is silent | NO-LOG |
| F1-O1 | No signal that anyone browses playbooks | NO-METRIC |
| F1-O2 | DB errors leaked, not logged | LEAK + NO-LOG |
| F2-O1 | Clone rate — the adoption funnel's first real step — uncounted | NO-METRIC |
| F3-O1 | Rule edits/deletes uncounted | NO-METRIC |
| F3-O2 | `updateRule` silently drops an invalid `clause_type` / `severity` | SILENT-CATCH |
| F3-O3 | Hard rule delete leaves no trace | NO-LOG |
| F4-O1 | Default changes uncounted — the moment a playbook starts affecting analysis | NO-METRIC |
| F5-O1 | Playbook resolution result unlogged | NO-LOG |
| F5-O3 | Rule-block truncation silent (in-prompt note only) | NO-LOG |
| F5-O4 | Invented / dropped `rule_id`s uncounted | NO-METRIC |
| G1-O1 | No nav-usage signal | NO-METRIC |
| G1-O2 | Dead affordances (⌘K, Filter, switcher) look interactive; clicks unrecorded | NO-METRIC |
| G2-O1 | Contract-list load never logged (ok or fail) | NO-LOG |
| G2-O2 | Raw DB error leaked, not logged | LEAK + NO-LOG |
| G3-O1 | The three trend series are placeholder constants presented as data | NO-METRIC |
| G4-O1 | `rowCount = 0` (non-owner / bad id) indistinguishable from success | SILENT-CATCH |
| G4-O2 | Optimistic update on a failed request never reconciled | NO-TRACE-CORRELATION |
| G5-O1 | Hard delete + cascade leaves no record; a mis-fire is unrecoverable and untraceable | NO-LOG |
| G5-O2 | Optimistic removal on a failed request → UI shows gone, DB has it | SILENT-CATCH |
| G5-O3 | No confirm on a destructive, cascading, prod-live action | (design) |
| G6-O1 | New-menu choice uncounted | NO-METRIC |
| H1-O1 | Gate rejections uncounted per route | NO-METRIC |
| H1-O2 | Ownership 404 vs real 404 indistinguishable | THIN-LOG |
| H1-O3 | SQL-only guard no-ops are invisible | NO-LOG |
| H2-O1 | No count of allowed compute calls → KPI has no denominator | NO-METRIC |
| H2-O2 | Fail-open events not counted | THIN-LOG |
| H2-O3 | Block-log insert failures swallowed | SILENT-CATCH |
| H3-O2 | ~20 routes leak raw DB messages + don't log | LEAK + NO-LOG |
| H4-O1 | Grounding-score fallback firing is invisible | NO-LOG |
| H4-O4 | `assertIndexFresh` throw not distinguished from other 500s | THIN-LOG |
| H5-O2 | No latency per LLM call | NO-METRIC |
| H5-O3 | Retry loop firing is invisible on `askLLM` | NO-LOG |
| H5-O4 | Truncated-JSON drops look like "nothing found" | NO-LOG |
| H7-O1 | No signal that storage is enabled/working in an env | NO-METRIC |

### Tier 1 — needs `src/lib/log.ts`, an op id, or a transaction

| id | Blind spot | Class |
|----|-----------|-------|
| A3-O1 | No activation funnel | NO-METRIC |
| A4-O1 | Sign-in events invisible | NO-METRIC |
| A6-O1 | Sign-out unlogged | NO-METRIC |
| B5-O1 | Orphan `contracts` rows from a mid-save failure invisible | NO-LOG |
| B6-O3 | `templateId` dropped between generate and save | NO-LOG |
| B8-O3 | `template_id` never persisted on the contract | NO-LOG |
| C4-O4 | The four writes of an Apply-fix share no correlation id | NO-TRACE-CORRELATION |
| C5-O2 | `was_applied` is dead → refine→apply acceptance is unmeasurable | NO-METRIC |
| C6-O2 | No `clause_refinements` row → the library insert leaves no audit trail | NO-LOG |
| C7-O3 | Duplicate rows from re-saving after reload | NO-METRIC |
| C9-O2 | Non-transactional insert + counter can diverge | NO-METRIC |
| C10-O2 | Error/limit strings saved as assistant turns, then fed back as context | SILENT-CATCH |
| C12-O3 | No snapshot for a selection refine → not recoverable from History | NO-METRIC (design) |
| C14-O1 | `DELETE`-then-`INSERT` with no transaction can empty the pending set | NO-LOG |
| C14-O4 | `issues_dismissed` / `risk_level` never reconciled after re-analyse | NO-METRIC |
| C15-O3 | Redundant double `GET /api/playbooks/{id}` per selection | NO-METRIC (waste) |
| D6-O2 | `embedRows` also vectorises user rows, unannounced | NO-LOG + SILENT-CATCH |
| D6-O3 | Partial seed on a mid-run throw is invisible | NO-LOG |
| E2-O2 | `body` HTML injected without a sanitiser | LEAK |
| E4-O3 | UI-created templates silently have no `sections` | NO-LOG |
| E5-O1 | `SaveAsTemplateDialog` defined, never mounted — no signal | NO-METRIC |
| E6-O2 | `sections[].clause_id` can dangle after a library re-seed, unnoticed | NO-LOG |
| F2-O2 | Non-transactional clone can leave a partial playbook silently | NO-LOG |
| F4-O3 | Clear-siblings + set-self not atomic → transient "no default" invisible | NO-LOG |
| H2-O4 | No "approaching limit" signal | NO-METRIC |
| H3-O1 | `errorResponse` logs without route / user / op id | THIN-LOG |
| H3-O3 | No error-rate metric | NO-METRIC |
| H4-O2 | No retrieval-quality signal | NO-METRIC |
| H4-O3 | No prod index health check | NO-METRIC |
| H5-O5 | `analyseContract`'s 2×3 call fan-out untraceable | NO-TRACE-CORRELATION |

### Tier 2 — durable Postgres counters

| id | Blind spot | Class | Table it wants |
|----|-----------|-------|----------------|
| B4-O2 | Playbook coverage never persisted → no history | NO-METRIC | `contract_playbook_coverage` |
| B7-O2 | No persisted grounding provenance | NO-METRIC | `contract_grounding` (or a column) |
| C3-O3 | Concurrent-tab last-write-wins is silent and lossy | NO-METRIC | `updated_at` precondition + 409 log |
| C8-O2 | `issues_dismissed` counter vs `status='dismissed'` count can diverge | NO-METRIC | reconciliation query / transaction |
| C15-O1 | Coverage never persisted → verdict history, tab blank on reload | NO-METRIC | `contract_playbook_coverage` (= B4-O2) |
| D2-O3 | FTS vs ILIKE contribution unknown | NO-METRIC | split-predicate `SELECT` |
| D3-O3 | User rows never semantically indexed — no signal | NO-METRIC | admin count query |
| D4-O4 | `embedded_at = null` backlog invisible | NO-METRIC | admin count query |
| D5-O1 | No approval history — revoke + re-approve leaves no trail | NO-METRIC | `clause_approval_events` |
| D5-O3 | Approved-share of the library uncounted | NO-METRIC | admin count query |
| D6-O1 | No seed-run record (time, corpus SHA, counts) | NO-METRIC | `seed_runs` |
| E6-O1 | No seed-run record (time, corpus SHA) | NO-METRIC | `seed_runs` (= D6-O1) |
| F4-O2 | RDG approval flips have no audit trail (last-write-wins on 2 columns) | NO-LOG | `playbook_approvals` |
| F5-O2 | Playbook coverage computed then discarded — no history | NO-METRIC | `contract_playbook_coverage` (= B4-O2) |
| H5-O1 | No token / cost accounting | NO-METRIC | `compute_calls` — **highest value** |
| H7-O2 | Orphaned stored files after contract hard-delete | NO-LOG | on-delete sweep (only once storage is enabled) |

### Unclassed — design / code debt, no observability fix

| id | Blind spot | Note |
|----|-----------|------|
| A5-O1 | `/welcome` is a self-described "smoke test" on the critical post-auth path | replace with a real first-run screen, or redirect straight to `/dashboard` — product call |
| A7-O2 | Dead guest-save code (`pendingSave` + banner) still shipped | delete it, or re-open the flow — product call |
| A9-O1 | Theme preference unknown | not worth instrumenting server-side; skip |
| D5-O4 | `approved_by` is an unverified self-attestation | a credentials model is the real fix; out of scope for observability |
| E6-O3 | Curated template ships `is_approved = false` with no review gate | matches [D5](d-clause-library.md#d5) — a review/credentials model |

---

## 5 · The first hour

Twelve lines. Each is a single `console.info` (one a `console.warn`) with a bracketed event name, no new file, no schema, no dependency. Together they instrument the **critical spine** — upload → analyse → save → review → apply-fix → refine → chat → export — plus the compute gate and every LLM call. After this, a `grep '\[analyse\] ok'` on the platform logs answers "how many analyses today, how slow, how big" that nothing answers now.

| # | Event line | Where | Closes |
|---|-----------|-------|--------|
| 1 | `console.info("[llm] call", { route, ms, ok, retries })` | `src/lib/llm.ts` — around the `fetch` in `askLLM` | `H5-O2`, `H5-O3` — **do this first**; it instruments every Gemini call from one place |
| 2 | `console.info("[gate] reject", { path })` | `src/proxy.ts` — the compute-gate 401 branch | `H1-O1`, `A7-O1` |
| 3 | `console.info("[extract] done", { ms, polls, chars })` | `src/app/api/extract/route.ts` — before the success `return` | `B2-O1`, `B2-O2` |
| 4 | `console.info("[analyse] ok", { chars, truncated, issues, ms, playbook })` | `src/app/api/analyse/route.ts` — before `NextResponse.json` | `B3-O1`, `B3-O3`, `B4-O1` |
| 5 | `console.info("[generate] ok", { type, grounded, topScore, ms })` | `src/app/api/generate/route.ts` — before the `return` | `B6-O1`, `B7-O1`, `B8-O2` |
| 6 | `console.info("[contracts] create", { id, clauses, ms })` | `src/app/api/contracts/route.ts` — after the clause insert | `B5` funnel; pairs with the `errorResponse` swap for `B5-O2` |
| 7 | `console.info("[review] loaded", { clauses, dismissed, chat, usedDelta, ms })` | `src/app/review/page.tsx` — before `setDbLoading(false)` | `C1-O2`, `C2-O2` |
| 8 | `console.info("[autosave] ok", { bytes, ms })` | `src/app/review/page.tsx` — the autosave `.then` | `C3-O2` |
| 9 | `console.info("[apply-fix] ok", { contractId, clauseId })` | `src/app/review/page.tsx` — after the three writes resolve | `C4-O3`, `C4-O2` (log the no-match too) |
| 10 | `console.info("[refine] ok", { chars, truncated, ms })` | `src/app/api/refine/route.ts` — before the `return` | `C5-O1`, `C5-O4` |
| 11 | `console.info("[chat] ok", { turns, ms, truncated })` | `src/app/api/chat/route.ts` — before the `return` | `C10-O1` |
| 12 | `console.info("[export]", { fmt, lines })` | `src/app/review/page.tsx` — after `exportContract` resolves | `C16-O1` |

Two companion moves, still tier-0, that belong in the same sitting:

- **Swap the 23 raw-message `catch`es for `errorResponse(err, "<route>")`** (`H3-O2`, and every `*-O` row that reads "Raw DB error leaked + unlogged" — `B5-O2`, `C1-O4`, `C7-O4`, `C9-O3`, `D1-O2`, `D4-O2`, `E1-O2`, `E4-O2`, `E5-O2`, `F1-O2`, `G2-O2`). One mechanical edit per route; it both stops the LEAK and produces the one `console.error` line those routes currently lack.
- **`console.warn` the curated-write 403s** (`D4-O3`, `E4-O4`) — they should be impossible from the UI, so any hit is a UI-bug canary.

The natural tier-1 follow-on is `src/lib/log.ts` (single-line JSON, an `x-lexora-op-id` header threaded through the multi-write actions — `C4-O4`, `H5-O5`, `H3-O1`), and the natural tier-2 follow-on is the `compute_calls` table (`H5-O1`), which turns lines 1, 4, 5, 10, 11 above into a queryable ledger with token counts and cost.

---

## 6 · Cross-cutting themes

- **`NO-METRIC` is just under half the register (83 of 178).** The system has no counters. Almost all of these are "nobody counts X" where X is a funnel step or a rate; the tier-0 answer is always the same shape — a `console.info` with the count in the payload.
- **`LEAK + NO-LOG` is a single fix repeated 12 times.** Every one is the raw-message `catch`. `errorResponse` already exists; it just isn't wired into the CRUD routes.
- **Every "latency unknown" gap is downstream of "no timing primitive".** Add `performance.now()` bracketing in `askLLM` (line 1) and the route handlers and roughly 15 `NO-METRIC` gaps get their number for free.
- **`SILENT-CATCH` (11) clusters on optimistic-UI paths** — `C11-O3` (`.catch(() => {})`), `D3-O1` (empty `catch` → lexical fallback), `H2-O3` (block-log insert), `G4-O1` / `G5-O2` (rowCount ignored). These are the ones that make a failure look like a success; each is one line in an existing `catch`.
- **`rate_limit_blocks` is the template.** It proves the pattern works: a fire-and-forget insert into a narrow table, queried later. `compute_calls`, `seed_runs`, `clause_approval_events`, `playbook_approvals`, and `contract_playbook_coverage` are all the same move — and five separate tier-2 gaps collapse into "adopt the `rate_limit_blocks` pattern four more times".

---

## See also

- [00-conventions](00-conventions.md#observability-notes-9-fixed-shape) — the §9 shape and the rubric these ids come from.
- [H3 — Error taxonomy](h3-error-taxonomy.md) — `errorResponse`, the LEAK class, and the routes that don't use it.
- [H2 — Rate limiting](h2-rate-limiting.md) — `rate_limit_blocks`, the one durable signal that exists.
- [H5 — LLM layer](h5-llm-layer.md) — where the token/cost ledger (`H5-O1`) would hook in.
- [README](README.md) — the master workflow table; every workflow's §9 block is the per-row detail behind this register.
