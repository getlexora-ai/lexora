# H9 — Clause guardrails

_The small set of legally load-bearing checks a drafted or uploaded contract must pass. Generation runs them as a gate; analysis folds them into its findings. This is the "one rulebook" that makes ["a generated contract is error-free"](b-getting-a-contract-in.md) a measurable claim (issue #8)._

Verified against `main` @ `f40b569`. New since the rest of the set's `bf4d660` baseline — the workflow files it touches ([B3](b-getting-a-contract-in.md#b3)/[B4](b-getting-a-contract-in.md#b4)/[B6](b-getting-a-contract-in.md#b6)/[B7](b-getting-a-contract-in.md#b7), [C14](c3-review-ai-and-output.md#c14)) carry a partial-reverify note.

---

## Why it exists

The analyser (Gemini, [H5](h5-llm-layer.md)) is probabilistic — it misses things, and it mixes "this clause is **void**" with "this is a weak negotiating position". The generator is the same model and can emit a draft its own re-analysis then flags. The guardrail engine is a **deterministic, pure** second opinion over a deliberately tiny policy: a handful of clause topics that carry a hard statutory limit under German residential-tenancy law, each with a machine check. It never calls the model, never touches I/O, and is `node --test`-importable (same purity rule as `src/lib/clause-taxonomy.ts`).

Two things consume it:

| Consumer | What it does with the report |
|----------|------------------------------|
| **`/api/generate`** ([B6](b-getting-a-contract-in.md#b6)/[B7](b-getting-a-contract-in.md#b7)) | Runs `evaluateGuardrails` on the draft; on a hard failure, one bounded LLM **repair pass**, then re-evaluates. Returns the report as `guardrails` in the response. |
| **`/api/analyse`** + **`/api/contracts/[id]/reanalyse`** ([B3](b-getting-a-contract-in.md#b3)/[B4](b-getting-a-contract-in.md#b4)/[C14](c3-review-ai-and-output.md#c14)) | `applyGuardrails` tags every model finding `compliance` / `negotiation`, **appends** a `compliance` finding for any hard guardrail failure the model missed, and returns the report as `guardrails`. |

---

## The module — `src/lib/guardrails/`

| File | Exports | Role |
|------|---------|------|
| `types.ts` | `ClauseTier`, `GuardrailConstraint`, `GuardrailStatus`, `GuardrailFinding`, `GuardrailFields`, `GuardrailReport` | Pure types. No `@/`, no `next/server`. |
| `rules.ts` | `GUARDRAIL_RULES`, `tierFor(key)`, `guardrailRuleKeys()`, `rulesForScope()` | **The policy.** Kept out of `clause-taxonomy.ts` on purpose — the taxonomy is the shared vocabulary; the guardrail policy evolves with the analyser. |
| `evaluate.ts` | `evaluateGuardrails(args)` | Runs the policy against contract text + structured fields. |
| `report.ts` | `formatGuardrailsForPrompt(report)` | Renders a report as a compact block for the repair prompt. |
| `index.ts` | re-exports the above | The public entry point. |

`src/lib/analysis.ts` adds `applyGuardrails()` + the `IssueCategory` type (`src/lib/analysis.ts:23, 325`) — the analysis-side fold, not part of the pure module.

---

## <a id="policy"></a>The policy — `GUARDRAIL_RULES` (`src/lib/guardrails/rules.ts:29`)

Seven rules, all `lease: true` (scope = `contractType === "Lease Agreement"`; any other type → empty policy → `ok: true` with no findings). Each rule is a taxonomy `topic`, a `tier`, an optional `presenceHint` regex, and one or more `constraints`.

| topic | tier | constraints | statute |
|-------|------|-------------|---------|
| `mietobjekt` | **guardrail** | `presence` | — |
| `miete` | **guardrail** | `presence` | — |
| `kaution` | **guardrail** | `deposit-cap` (3 × `baseRentEur`) + `forbidden-pattern` ("vier/4/fünf/5/sechs Nettokaltmieten") | § 551 Abs. 1 BGB |
| `betriebskosten` | important | `required-pattern` (12-month / Abrechnungsfrist) — only once the topic is present | § 556 Abs. 3 BGB |
| `kuendigung` | important | `presence` + `required-pattern` (Kündigungsfrist / § 573c) + `forbidden-pattern` (Kündigungsausschluss > 4 years) | § 573c BGB, § 557a Abs. 3 (analog) |
| `schoenheitsreparaturen` | important | `forbidden-pattern` (starre Fristen) | § 307 BGB (BGH) |
| `kleinreparaturen` | important | `forbidden-pattern` (no betragsmäßige Obergrenze) | § 307 BGB (BGH) |

**`tier`**

- **`guardrail`** — a failure is a **hard failure** (`report.hardFailures`). Generation blocks-and-repairs on it; analysis tags it `compliance` and injects it if the model missed it. Missing a `guardrail` topic that only has a `presence` check *is* a hard failure.
- **`important`** — a failure is a **soft flag** (`report.softFlags`). Surfaced, never blocks.

`tierFor(key)` returns `"guardrail"` / `"important"` / `"optional"` for any taxonomy key (`"optional"` = carries no rule).

### `GuardrailConstraint` kinds (`src/lib/guardrails/types.ts:13`)

| kind | check | `unchecked` when |
|------|-------|-----------------|
| `presence` | the topic appears somewhere (heading scan ∪ `presenceHint`) | never — absent ⇒ `missing` |
| `deposit-cap` | `targetField` ≤ `multiple` × `ofField`, e.g. deposit ≤ 3 × cold rent | neither the field nor an `amountNear` text match yields a number |
| `forbidden-pattern` | regex must **not** match the text | never |
| `required-pattern` | regex **must** match — but only once the topic is present | topic not present |

Numbers come from `GuardrailFields` first (`baseRentEur` / `operatingCostsEur` / `depositEur`, supplied by the caller), then a fallback: `amountNear(text, keyword)` parses the first `EUR`/`€` amount within ~180 chars of a Kaution/Miete keyword, German-format aware (`"1.234,56"` → `1234.56`) (`src/lib/guardrails/evaluate.ts:33-57`).

---

## <a id="report"></a>`GuardrailReport` (`src/lib/guardrails/types.ts:48`)

```
{
  contractType: string,
  findings:     GuardrailFinding[],   // one per in-scope rule
  hardFailures: GuardrailFinding[],   // tier "guardrail"  && status missing|violation
  softFlags:    GuardrailFinding[],   // tier "important"  && status missing|violation
  ok:           boolean,              // hardFailures.length === 0
}
```

Each `GuardrailFinding`: `topic`, `label` (`topicLabel(topic, language)`), `tier`, `status` (`ok` / `missing` / `violation` / `unchecked`), `detail` (a human sentence — the constraint messages are authored in German), optional `reference` (the statute). Status precedence when a rule has several constraints: `violation` > `missing` > `unchecked` > `ok` (`STATUS_RANK`, `evaluate.ts:17`).

---

## <a id="wiring-generate"></a>Wiring — `/api/generate` (`src/app/api/generate/route.ts`)

`guardrailFieldsOf(body)` pulls `baseRentEur` / `operatingCostsEur` / `depositEur` from the request (`:59, 183`). Three paths, all end with a `guardrails` key in the response:

1. **Deterministic template fast path** (`:193-206`) — a fully-filled template, in the requested language, with no `keyTerms` → substitute and return, **no model call**. `evaluateGuardrails` still runs; a failure here is a curated-template bug worth surfacing (compare [E-templates](e-templates.md)).
2. **Draft** (`:208-268`) — the RAG lease path ([B7](b-getting-a-contract-in.md#b7)) or the ungrounded non-lease prompt ([B6](b-getting-a-contract-in.md#b6)).
3. **Guardrail gate + one bounded repair pass** (`:270-292`) — after drafting:
   - `evaluateGuardrails({ contractText: draftText, contractType, fields, language })`.
   - If `!guardrails.ok`: `repairGuardrails(draftText, report, language)` (`:154`) — one `askLLM` call (`maxTokens 8192`), system prompt "fix ONLY the listed guardrail violations, change nothing else", body = `formatGuardrailsForPrompt(report)` + the curated library wording for the failing topics (`curatedClausesFor`, `:132` — best-effort `listClauses({ scope: "curated" })`, swallows a DB/seed miss) + the draft.
   - Re-evaluate on the repaired text. **One pass only.** A repair failure is caught and logged (`console.error("[generate] guardrail repair failed:", :290`); the unrepaired draft + its report still return.
   - The response can therefore carry `guardrails.ok === false` — the client is expected to surface the residue, not assume zero.

## <a id="wiring-analyse"></a>Wiring — `/api/analyse` + `/api/contracts/[id]/reanalyse`

`analyseContract` and `analyseContractWithPlaybook` now return `{ issues, guardrails }` (were `Issue[]` / `{ issues, coverage }`) (`src/lib/analysis.ts:430, 489`). Both call **`applyGuardrails(issues, { contractText, contractType, fields?, language, hasRules })`** (`:325`):

- `evaluateGuardrails` on the same text.
- **Categorise every issue** → `category: "compliance" | "negotiation"`:
  - cites a `§`-token that a guardrail constraint's `reference` uses → `compliance`;
  - else its `clause` maps (`guessTopic`) to a guardrail-tier topic → `compliance`;
  - else `negotiation` when a playbook drove the review (`hasRules`), else `compliance` (a no-playbook review only reports legal defects).
  - `info` is declared but never emitted.
- **Inject** a synthetic `type: "high"`, `category: "compliance"` issue for every `hardFailures` entry whose topic no model finding already covers.
- Transport failed both attempts but a guardrail hard-fails → return the guardrail-only issues instead of throwing (`analyseContract`, `:459-460` / `:474-475`).

`contractType` reaches these from the route body (`analyse/route.ts:38, 52`; `reanalyse/route.ts:41, 50`). `fields` is **not** plumbed from the analyse/reanalyse routes today — numeric caps there rely on the `amountNear` text fallback.

---

## <a id="category"></a>`risk_clauses.category` (`db/009_guardrail_category.sql`)

```sql
create type clause_category as enum ('compliance', 'negotiation', 'info');   -- db/schema.sql:46
alter table risk_clauses add column if not exists category clause_category;  -- db/schema.sql:137
```

- **Written by** `/api/contracts/[id]/reanalyse` only — the bulk insert went from 11 to 12 value columns (`reanalyse/route.ts:70` `COLS = 12`, `:88-93`).
- **Not written by** `POST /api/contracts` (the [B5](b-getting-a-contract-in.md#b5) first-save bulk insert) — a freshly analysed-then-saved contract has `category = null` on every row until the first re-analysis.
- **Not read back** — `GET /api/contracts/[id]` does not select it, so the review screen only has `category` for clauses it got from a live re-analyse response, not from a reload.
- `RiskClause.category` is on the shared type (`src/lib/analysis-store.ts:19`).

⚠ **Prod migration pending** — `db/009` must be run against the prod Neon DB (`psql "$DATABASE_URL" -f db/009_guardrail_category.sql`); until then a re-analyse insert that includes the `category` column fails on prod. Tracked alongside the `db/005` + `rag:ingest` item in `MEMORY.md`.

---

## <a id="ui"></a>UI — `GuardrailStrip` (`src/components/guardrail-strip.tsx:50`)

Presentational only; declares its own prop shape (`GuardrailReportView`) so it doesn't import the engine. Red when `hardFailures.length`, amber when only `softFlags.length`, green otherwise; lists each failing finding with its `label`, `detail`, `reference`.

**Rendered in exactly one place:** the review screen, above the editor, after a **re-analyse** (`src/app/review/page.tsx:197` state, `:876` `setGuardrails(data.guardrails ?? null)`, `:1311-1314` render). The `guardrails` key that `/api/generate` and the initial `/api/analyse` return is **currently discarded by the client** — the create modal ([B6](b-getting-a-contract-in.md#b6)) and the `/analysis` page don't read it. So a user only sees guardrail status once they re-run the analysis on the review screen.

---

## <a id="cli"></a>Dev tool — `scripts/guardrail-check.mjs`

```
node scripts/guardrail-check.mjs contract.txt --rent 1200 --deposit 5000 --type "Lease Agreement"
node scripts/guardrail-check.mjs contract.txt --json
cat contract.txt | npm run guardrails:check
```

No server, no DB, no LLM — imports `src/lib/guardrails/index.ts` directly. Prints each finding with a `HARD`/`soft` tag and a status mark; **exits non-zero when a hard guardrail fails**, so it can gate a script over a fixtures folder. `package.json:13` — `"guardrails:check"`. The fast loop for tuning `rules.ts`.

Unit coverage: `tests/guardrails.test.mjs` (`node --test`).

---

## Diagram — generate gate + repair

```mermaid
sequenceDiagram
  participant API as Route handler
  participant GM as Gemini
  API->>API: draft (RAG lease / plain prompt / template fast-path)
  API->>API: evaluateGuardrails(draft, fields) → report
  alt report.ok === false
    API->>API: formatGuardrailsForPrompt(report) + curated clauses
    API->>GM: askLLM "fix ONLY these violations" (maxTokens 8192)
    GM-->>API: repaired draft
    API->>API: evaluateGuardrails(repaired) → report'
    Note over API: one pass only; a throw here is logged, unrepaired draft still returned
  end
  API-->>API: { text, guardrails: report[']  , … }
```

---

## Observability notes

**What you can see today.** `console.error("[generate] guardrail repair failed:", err)` (`generate/route.ts:290`) when the repair `askLLM` throws. Nothing else — no log of a hard failure being detected, whether the repair pass fired, or whether it actually cleared the failure.

**What you can't.** How often a fresh draft hard-fails (the #8 metric). Repair-pass success rate — did `report'` clear, or does the contract ship with `guardrails.ok === false`? Which topic fails most. How often `deposit-cap` falls back to `amountNear` because `fields` weren't supplied. Whether the injected `compliance` findings (model-missed hard failures) are common — i.e. how much the guardrail is actually covering for the model.

**Gaps.**

| # | Blind spot | Class | Cheapest fix |
|---|-----------|-------|--------------|
| H9-O1 | Hard-failure detection + repair-pass outcome unlogged | NO-LOG | `console.info("[guardrail]", { hard: report.hardFailures.length, repaired: !!repaired, okAfter: report2.ok })` in `generate/route.ts` — tier 0; **the #8 metric** |
| H9-O2 | Injected (model-missed) `compliance` findings not counted | NO-METRIC | count `hardFailures` not in `covered` inside `applyGuardrails` — tier 0/2 |
| H9-O3 | `category` written only by re-analyse, never by first save, never read back | NO-TRACE-CORRELATION | add `category` to the `POST /api/contracts` bulk insert and the `GET /api/contracts/[id]` select — tier 1 |
| H9-O4 | `guardrails` returned by `/api/generate` + initial `/api/analyse` is dropped client-side | LEAK (unused output) | render `GuardrailStrip` on the create-review handoff and `/analysis` — tier 0/1 |
| H9-O5 | `deposit-cap` silently `unchecked` when `fields` absent on the analyse path | NO-LOG | plumb `fields` from the review screen into `/reanalyse`; log `unchecked` count — tier 1 |

---

## See also

- [H5 — LLM layer](h5-llm-layer.md) — the `askLLM` the repair pass and the analyser share.
- [H6 — Database schema](h6-database-schema.md) — `risk_clauses.category`, the `clause_category` enum.
- [B6](b-getting-a-contract-in.md#b6) / [B7](b-getting-a-contract-in.md#b7) — the generate paths this gates.
- [B3](b-getting-a-contract-in.md#b3) / [B4](b-getting-a-contract-in.md#b4) / [C14](c3-review-ai-and-output.md#c14) — the analysis paths that fold it in.
- [F5](f-playbooks.md#f5) — playbook rules: the *other* rule layer, model-applied and negotiation-focused, distinct from this deterministic statutory one.
- [Z — Dead ends](z-dead-and-unwired.md) — the unread `category` column and the dropped `guardrails` response key.
