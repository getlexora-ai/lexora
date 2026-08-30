# H3 — Error taxonomy

_How errors are shaped on the way back to the client. Referenced by every workflow's **§7 Failure modes**._

Verified against `main` @ `bf4d660`. File: `src/lib/errors.ts` (34 lines).

---

## The two pieces

```ts
class AppError extends Error {
  status: number;   // HTTP status
  code: string;     // short machine code, e.g. "llm_busy"
  message: string;  // safe to show a user
}

errorResponse(err, context = "api"): NextResponse
```

`errorResponse` (`src/lib/errors.ts:25-34`):
- `err instanceof AppError` → `NextResponse.json({ error: code, message }, { status })`.
- anything else → `console.error("[<context>]", err)` **server-side only**, then `{ error: "internal", message: "Something went wrong on our end. Please try again." }` at `500`.

So a well-formed error carries a stable `code` the client can branch on and a `message` the client can display; an unexpected error is logged with a context tag and flattened to a generic 500.

---

## `AppError` codes in use

Almost all thrown from [`askLLM`](h5-llm-layer.md) or `analyseContract`:

| Code | Status | Thrown at | Meaning |
|------|-------:|-----------|---------|
| `llm_config` | 500 | `src/lib/llm.ts:49` | `GEMINI_API_KEY` unset |
| `llm_busy` | 503 | `src/lib/llm.ts:95` | Gemini 503/429 after 3 retries |
| `llm_error` | 502 | `src/lib/llm.ts:97` | Gemini non-OK, non-transient |
| `llm_blocked` | 422 | `src/lib/llm.ts:107` | `promptFeedback.blockReason` set |
| `llm_no_output` | 502 | `src/lib/llm.ts:118` | empty candidate text |
| `analysis_failed` | 422 | `src/lib/analysis.ts` (`analyseContract`, both attempts failed) | model returned nothing usable |
| `generate_missing_fields` | 400 | `src/app/api/generate/route.ts` (`draftGermanLease`) | lease request without address / rent |
| `llm_busy` | 503 | `src/app/api/generate/route.ts` | wraps `QuotaExhaustedError` from the RAG client |

---

## Which routes use it

Only **7 of ~26 route files** call `errorResponse`: `analyse`, `generate`, `extract`, `refine`, `chat`, `contract-edit`, `clause-library/search`. These are the compute routes — the ones that call `askLLM`, where a structured `code` matters.

⚠ **Everything else returns raw DB error text.** The pattern `catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }) }` appears in ~20 handlers — e.g. `src/app/api/contracts/route.ts:20, 107`, every `/api/contracts/[id]/*` route, the clause-library and templates CRUD routes. A constraint violation or a malformed query sends its Postgres message string to the browser. This is a **LEAK** ([H8](h8-observability.md) rubric) and the exact thing `errorResponse` exists to prevent.

---

## Client expectations

Callers read `res.ok`, then `data.message` (fallback to a hard-coded string), and special-case `res.status === 429` (see [H2](h2-rate-limiting.md#client-handling)). Examples: `src/app/analysis/page.tsx:60-71` (`assertOk`), `src/app/(workspace)/dashboard/page.tsx:428-447`, `src/app/review/page.tsx` (`setComputeError`). None of them branch on the `code` field — it exists but the UI only uses `message`.

---

## Observability notes

**What you can see today.** For the 7 routes that use it: one `console.error("[<context>]", err)` per unexpected error (`src/lib/errors.ts:29`) — no request id, no user id, no route path beyond the hand-passed `context` string, no timing. For the ~20 that don't: `console.error` only if the handler happens to have its own (most don't), plus the leaked message in the response body.

**What you can't.** The error rate per route. Whether a 500 was a known `AppError` mapped correctly or a genuine surprise. Correlate a client-reported failure to a server log line (no shared id).

**Gaps.**

| # | Blind spot | Class | Cheapest fix |
|---|-----------|-------|--------------|
| H3-O1 | `errorResponse` logs without route / user / op id | THIN-LOG | pass `req` in and log `{ event:"error", route, userId, opId, code, status }` — tier 1 |
| H3-O2 | ~20 routes leak raw DB messages + don't log | LEAK + NO-LOG | replace the ad-hoc `catch` with `errorResponse(err, "<route>")` everywhere — tier 0/1 |
| H3-O3 | No error-rate metric | NO-METRIC | count non-2xx by route in `src/lib/log.ts` — tier 1 |

---

## See also

- [H5 — LLM layer](h5-llm-layer.md) — source of most `AppError`s.
- [H8 — Observability](h8-observability.md) — the LEAK class and the tier-0 fix.
