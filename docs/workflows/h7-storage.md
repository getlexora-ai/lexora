# H7 — Storage (the original uploaded file)

_Pluggable, wired everywhere, **inert by default.** Referenced by [B2](b-getting-a-contract-in.md) and the dead [`GET /api/contracts/[id]/original`](z-dead-and-unwired.md)._

Verified against `main` @ `bf4d660`. File: `src/lib/storage.ts`.

---

## Why it exists

Audit finding **C2** (`docs/product-audit.md`): after `/api/extract` runs LLMWhisperer, only the lossy `layout_preserving` text survives — the original PDF/DOCX is discarded. This module keeps the original behind a small interface so a "view source" / "diff to original" feature can be built later. It is inert until a backend is configured, so nothing breaks today.

---

## The interface

```ts
isStorageEnabled(): boolean
putOriginal(bytes: Buffer, { userId, filename, contentType }): Promise<string | null>   // → storage key, or null
getOriginal(key: string): Promise<{ body: Buffer; contentType: string } | null>
```

Keys are opaque and user-namespaced: `originals/<userId>/<uuid>-<safeFilename>` (`buildKey`, `src/lib/storage.ts:64`). `safeUserId` / `safeFilename` strip anything outside `[A-Za-z0-9._-]` and clamp length.

---

## Drivers — chosen by `STORAGE_DRIVER`

| Value | Behaviour | Cite |
|-------|-----------|------|
| unset / `"none"` | **no-op.** `put()` → `null`, `get()` → `null`, `isStorageEnabled()` → `false`. **This is the default and the current production state** — `.env.local` has no `STORAGE_DRIVER`. | `src/lib/storage.ts:80-88` |
| `"fs"` | Writes under `STORAGE_FS_DIR` (dev / self-host), with a `.meta.json` sidecar for the content type. Rejects keys that escape the root. **Falls back to no-op with a one-time `console.warn` if `STORAGE_FS_DIR` is unset.** | `src/lib/storage.ts:92-155` |
| `"s3"` | **Throwing stub.** `put()` / `get()` throw `"s3 driver not implemented — install @aws-sdk/client-s3"`. `@aws-sdk/client-s3` is not in `package.json`. | `src/lib/storage.ts:160-182` |
| anything else | `console.warn` + no-op | `src/lib/storage.ts:196-198` |

`resolveDriver()` reads the env var **on every call** (not memoised), so tests and hot config changes see the current driver.

---

## Where it's wired

| Call site | What it does | Effect today (driver = none) |
|-----------|--------------|------------------------------|
| `src/app/api/extract/route.ts:59-75` | `putOriginal(bytes, …)` after reading the upload, before LLMWhisperer. Wrapped in try/catch — **a storage failure must not fail extraction**, so it's swallowed to `console.error` and `filePath` stays `null`. | Returns `null`; `contracts.file_path` is `null`. |
| `src/app/analysis/page.tsx:189` | carries `file_path` from the extract response into the `POST /api/contracts` payload | persists `null` |
| `src/app/api/contracts/[id]/original/route.ts` | `isStorageEnabled()` gate, then `getOriginal(file_path)`, streams the bytes back with `Content-Disposition: attachment` | `isStorageEnabled()` is `false` → `404`. **And no component ever fetches this route** — see [z-dead-and-unwired](z-dead-and-unwired.md). |

---

## Observability notes

**What you can see today.** `console.warn` once if `fs` is misconfigured (`src/lib/storage.ts:100`) or the driver name is unknown (`:197`). `console.error("[extract] putOriginal failed", …)` if a `put` throws (`src/app/api/extract/route.ts:73`).

**What you can't.** Anything about storage volume or hit rate — there's nothing to see because the driver is off. When storage *is* enabled: no metric for bytes stored, no log on a successful `put`/`get`, no orphan detection (a `contracts` hard-delete leaves the stored file behind — nothing cleans it up).

**Gaps.**

| # | Blind spot | Class | Cheapest fix |
|---|-----------|-------|--------------|
| H7-O1 | No signal that storage is enabled/working in an env | NO-METRIC | log `isStorageEnabled()` + driver name at boot — tier 0 |
| H7-O2 | Orphaned stored files after contract hard-delete | NO-LOG | on delete, `getOriginal`-then-delete, or a nightly sweep — tier 2 (only relevant once enabled) |

---

## See also

- [B2](b-getting-a-contract-in.md) — the extract flow that calls `putOriginal`.
- [z-dead-and-unwired](z-dead-and-unwired.md) — `GET /api/contracts/[id]/original`.
- [H6 — Database schema](h6-database-schema.md) — `contracts.file_path`.
