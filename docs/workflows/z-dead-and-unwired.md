# Z — Dead ends & unwired code

_Everything the code contains that a user cannot currently reach, plus the shipped behaviours that are bugs. One short entry each — the full workflow treatment is deliberately skipped, since some of this may be deleted rather than documented._

Verified against `main` @ `bf4d660`, with `f40b569` updates to Z6, Z-B10 and new entries Z9 / Z-B16 / Z-B17 for the clause-guardrails + PII-playground work.

---

## Part 1 — Unreachable code

### Z1 — `POST /api/clauses/[clauseId]/refinements` (and its `GET`)

`src/app/api/clauses/[clauseId]/refinements/route.ts` — a complete handler pair with **no caller**. The review screen writes refinements via the *nested* route instead: `src/app/review/page.tsx` → `POST /api/contracts/[id]/clauses/[clauseId]/refinements` (`src/app/api/contracts/[id]/clauses/[clauseId]/refinements/route.ts:9`). The `GET` on either route — the only way to *read* `clause_refinements` — is also uncalled, so refinement history is **write-only in practice**. Superseded by the contract-scoped route; safe to delete.

### Z2 — `GET /api/contracts/[id]/original`

`src/app/api/contracts/[id]/original/route.ts` — a correct owner-gated file-download handler (`isStorageEnabled()` gate → `getOriginal(file_path)` → streamed bytes with `Content-Disposition: attachment`). **No component fetches it.** Doubly off: [storage](h7-storage.md) is disabled by default (`STORAGE_DRIVER` unset) *and* `contracts.file_path` is always `null` because [B2](b-getting-a-contract-in.md#b2)'s `putOriginal` no-ops. This is the intended endpoint for a future "view source / diff to original" feature.

### Z3 — `SaveAsTemplateDialog` (E5)

`src/components/templates/save-as-template-dialog.tsx` defines a full "save this contract as a template" dialog — regex literal-suggestion for currency/date, live preview, an AI "Suggest variables" button. `grep -rn "SaveAsTemplate" src` returns **only the definition line**. Nothing imports or mounts it. Its two backing routes are live and correct:
- `POST /api/templates/from-contract` — `ownsContract`-gated, deterministic longest-literal-first replacement of supplied literals → `{{key}}`, sets `based_on_contract_id`.
- `POST /api/templates/suggest-variables` — [compute-gated](h1-auth-and-ownership.md#gate) + `template-vars` rate limit, `askLLM` with a `responseSchema`, 12 000-char input cap, drops any `literal` not found verbatim in the contract.

Reachable only by direct HTTP. See [e-templates.md#e5](e-templates.md) for the trace.

### Z4 — `/onboarding`

`src/app/onboarding/page.tsx` — a 4-step wizard (Profile → Workspace → First contract → Done). Its own header comment: *"Entirely client-side and entirely presentational — nothing here writes to the database or touches the auth flow."* **Nothing links to it.** The Clerk post-auth destination is `/welcome` (`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`), and [`/welcome`](a-identity-and-entry.md#a5) links straight to `/dashboard`. The "sign-up → onboarding → welcome → dashboard" chain does not exist; the real chain is **sign-up → `/welcome` → `/dashboard`**. Either wire it in as the first-run screen or delete it.

### Z5 — The signed-out "analyse, save later" flow

`src/app/analysis/page.tsx` still carries the pre-gate guest path: `pendingSave` state, a `persist`-returns-false-on-401 branch, an effect to flush `pendingSave` after sign-in, and a *"This analysis won't be saved. Sign in to keep it"* banner. Since `/api/extract` and `/api/analyse` now 401 at the [middleware](h1-auth-and-ownership.md#gate) for guests, a signed-out visitor dies at step 1 (`"Text extraction failed"`) and never produces an analysis to stash. The dashboard guest banner (*"You can analyse a contract, but saving requires an account"*, `src/app/(workspace)/dashboard/page.tsx:353-363`) makes the same dead promise. See [A7](a-identity-and-entry.md#a7).

### Z6 — Review-screen "Compare" and "Approval" tabs

`NAV_TABS` (`src/app/review/page.tsx:70`) lists five tabs; only **Review / History / Playbook** have real branches. "Compare" and "Approval" fall through to a "coming soon" placeholder. The review-screen left rail's **"Risk dashboard"** (`RAIL`, `src/app/review/page.tsx:63-68` — no `href`) and **"Settings"** are still dead, as is the sidebar's `INSIGHTS_NAV` **"Activity"** (`soon` badge). ✅ **The sidebar's "Risk dashboard" is now live** @ `f40b569` — `INSIGHTS_NAV` (`src/components/sidebar.tsx:39`) lost its `soon: true`, and `/risk` (`src/app/(workspace)/risk/page.tsx`) renders the real portfolio charts ([G3](g-dashboard-and-workspace.md#g3)).

### Z7 — Roadmap DB tables

`organisations`, `org_members`, `clause_comments`, `approval_requests`, `approval_decisions` — full schema in `db/schema.sql`, the `org_member_role` and `approval_status` enums defined, **zero code references**. Kept intentionally per `docs/product-audit.md` (do not drop). Every feature table's `org_id` column is nullable and never populated — orgs are unbuilt.

### Z8 — Decorative UI

- **Navbar ⌘K search field + Filter button** (`src/components/navbar.tsx` app variant) — rendered, no handler, no keybinding.
- **`Sidebar` `contractCount` prop** (`src/components/sidebar.tsx`) — accepted, never passed by `(workspace)/layout.tsx`, so the Contracts nav item never shows a count.
- **`PRO` model constant** (`src/lib/llm.ts:14`) — `gemini-pro-latest`, unused; 429s on the free tier.

### Z9 — PII pseudonymisation: the library + the `/dev/pii` playground (issue #3)

`src/lib/pii/*` is a **complete** deterministic-swap + pattern + optional LLM-scan pseudonymisation toolkit — `sanitize` / `desanitize`, `buildMap`, `collectMatches`, `auditLeaks` / `auditResidual`, Faker-style vs `[NAME_1]` pseudonym styles, German morphology. **No production path calls it.** The only consumer is:

- **`/dev/pii`** (`src/app/dev/pii/page.tsx`, ~390 lines) — a 4-stage playground UI (original → sanitised → LLM output on pseudonyms → re-inserted), for choosing a design for issue #3.
- **`POST /api/dev/pii-roundtrip`** (`src/app/api/dev/pii-roundtrip/route.ts`) — drives it. **Not in `src/proxy.ts` (no auth gate)** and **`404`s when `NODE_ENV === "production"`** (`:40`). It *does* call `askLLM` (real Gemini) with no rate-limit tier.

Reachable in dev by typing `/dev/pii`; nothing links to it. This is scaffolding for [issue #3](https://github.com/getlexora-ai/lexora/issues/3), not a shipped feature — the real generation/analysis paths still send raw party data to the LLM.

---

## Part 2 — Shipped bugs (documented, not fixed)

These are live behaviours. The workflow files note each at the relevant step; collected here for a single view.

### Z-B1 — Contract-type vocabulary mismatch → playbook defaults never fire for uploads

`src/components/upload-modal.tsx` emits **lowercase codes** (`nda`, `lease`, …). `src/lib/contract-types.ts` and the generate modal use **display names** (`"Lease Agreement"`). The upload path carries `type=lease` through `/analysis` into `/api/analyse` as `contractType`, where `resolvePlaybookForAnalysis` matches `contract_type = $2` (`src/lib/playbooks.ts:155-160`) against a display name. **No match → the user's default playbook is silently never applied to an uploaded contract.** Only the review-screen [re-analyse](c3-review-ai-and-output.md) path (which sends the display name + an explicit `playbookId`) reaches the playbook branch. See [B4](b-getting-a-contract-in.md#b4), [F5](f-playbooks.md).

### Z-B2 — A curated playbook can never be the resolved default

`resolvePlaybookForAnalysis` requires `user_id = $1` (`src/lib/playbooks.ts:156`); the seed writes `user_id = null, is_default = false` (`scripts/seed-playbooks.mjs`). Out of the box **no playbook applies to analysis** until the user clones the curated one ([F2](f-playbooks.md)) *and* sets it as their default ([F4](f-playbooks.md)).

### Z-B3 — Playbook coverage is never persisted

`analyseContractWithPlaybook` returns `coverage`; `/api/analyse` and `/api/contracts/[id]/reanalyse` return it to the client; **there is no coverage table** ([H6](h6-database-schema.md)). Reload the review screen and the Playbook tab's coverage list is empty until the next re-analyse.

### Z-B4 — User-created library clauses are never embedded

`createClause` (`src/lib/clause-library.ts`) writes no `embedding`; `searchClauses` filters `embedding is not null`. Only `npm run seed:library -- --embed` populates vectors, and only for curated rows. **Semantic search ([D3](d-clause-library.md)) never returns a user's own clauses.**

### Z-B5 — `POST /api/contracts` is not transactional

Contract insert (`src/app/api/contracts/route.ts:56`) then a separate bulk clause insert (`:74`). A failure between them leaves a `contracts` row with `total_issues = N` and **zero `risk_clauses`**. Same for the re-analyse re-insert.

### Z-B6 — Re-analyse zeroes `issues_fixed` but not `issues_dismissed`

`src/app/api/contracts/[id]/reanalyse/route.ts:90-93` — `total_issues = N`, `issues_fixed = 0`, `playbook_id` set; `issues_dismissed` is left as-is. And it deletes only `status = 'pending'` rows (`:61`), so previously-dismissed clauses survive a re-analyse while the dismissed counter keeps its old value.

### Z-B7 — ~20 routes leak raw DB error text

`catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }) }` in every `/api/contracts/[id]/*` route, the clause-library / templates / playbooks CRUD routes, etc. A Postgres error string reaches the browser. `src/lib/errors.ts` (`errorResponse`) exists to prevent this and is used by only 7 routes. See [H3](h3-error-taxonomy.md).

### Z-B8 — `GET /api/contracts/[id]` omits `issues_dismissed`

`src/app/api/contracts/[id]/route.ts:15-16` doesn't select it, so the review screen has no dismissed tally (the list endpoint `/api/contracts` does select it).

### Z-B9 — `contract_versions` grows unbounded

One jsonb snapshot per Apply-fix / AI edit / manual save / restore ([C13](c3-review-ai-and-output.md)). No pruning, no cap.

### Z-B10 — `contract-edit` inlines the whole document, no cap

`src/app/api/contract-edit/route.ts:69-70` — the entire `currentDocument` goes into the system prompt with no `slice()`. Every other LLM route caps its input ([H5](h5-llm-layer.md#max-chars)). _(The brittle `---EXPLANATION---` string-split is **fixed** @ `f40b569` — replaced by the forgiving `parseEditReply` parser in `src/lib/contract-edit-reply.ts`, which downgrades a malformed reply to a plain answer rather than blanking the contract; see [C11](c3-review-ai-and-output.md#c11). The input cap is still absent.)_

### Z-B11 — `contracts.deleted_at` exists but nothing sets it

`GET`/list filter `deleted_at is null` defensively, but the delete path is a **hard `DELETE`** ([G5](g-dashboard-and-workspace.md)) that cascades to `risk_clauses`, `contract_versions`, `chat_messages`, `clause_comments`. No soft delete, no confirm, no undo.

### Z-B12 — `contracts.template_id` never populated

`POST /api/contracts` accepts `template_id` and the column + FK exist, but the generate client drops the `templateId` that `/api/generate` returns. See [B6](b-getting-a-contract-in.md#b6)/[B8](b-getting-a-contract-in.md#b8).

### Z-B13 — `rate_limit_blocks.scope` is always `'user'`

The column comment says `'guest' | 'user'`; `enforceRateLimit` returns `null` with no user id and hardcodes `"user"` on the insert ([H2](h2-rate-limiting.md)). The `scope === "guest"` branches in the three client error handlers (`analysis/page.tsx`, `review/page.tsx`, `dashboard/page.tsx`) are dead.

### Z-B14 — "Seed test data" ships to production

`src/app/(workspace)/dashboard/page.tsx` — the `FlaskConical` button POSTs a hardcoded MSA. No `NODE_ENV` guard. See [B10](b-getting-a-contract-in.md#b10).

### Z-B15 — The root `README.md` is stale

Claims Anthropic Claude and localStorage persistence. It is Gemini + Neon Postgres. This `docs/workflows/` set supersedes it.

### Z-B16 — `risk_clauses.category` is write-only-on-reanalyse and never read back (@ `f40b569`)

The [clause-guardrail](h9-guardrails.md#category) `category` tag (`compliance` / `negotiation`) is computed by `/api/analyse` **and** `/api/contracts/[id]/reanalyse`, but only **reanalyse** persists it (`db/009` column). `POST /api/contracts` (the [B5](b-getting-a-contract-in.md#b5) first save) has no `category` in its insert, and `GET /api/contracts/[id]` doesn't select it — so a freshly analysed-and-saved contract has `category = null` on every row, and a page reload loses whatever `category` a live re-analyse produced. ⚠ `db/009` is also **not applied on prod** (`MEMORY.md`) — the re-analyse INSERT throws there until it is.

### Z-B17 — the `guardrails` report is dropped on every path except review-screen re-analyse (@ `f40b569`)

`/api/generate` (all three paths, incl. the `rendered: true` fast path) and the initial `/api/analyse` both return a `GuardrailReport`. The create-contract flow (`dashboard/page.tsx` `onGenerate`) and the `/analysis` page read only `text` / `clauses` and **discard `guardrails`**. `GuardrailStrip` (`src/components/guardrail-strip.tsx`) renders in exactly one place: above the editor after `handleReanalyse` sets `setGuardrails(...)` (`src/app/review/page.tsx:876`). So a user never sees guardrail status on a freshly generated contract until they manually re-analyse it.

---

## Route coverage note

`find src/app/api -name route.ts` → 32 files (was 26 when this note was first written; +`/api/dev/pii-roundtrip` @ `f40b569`, see [Z9](#z9)). Every exported `GET`/`POST`/`PATCH`/`DELETE` is traced in a workflow file **or** listed here (Z1, Z2, Z3, Z9). The dead-guest `GET`s on `/api/clauses/[clauseId]/refinements` and `/api/contracts/[id]/original` and the dev-only `/api/dev/pii-roundtrip` are the handlers with no live production caller.
