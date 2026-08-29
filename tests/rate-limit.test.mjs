// Rate limiter — pure unit tests + one integration test against the dev server.
//   node --test 'tests/**/*.test.mjs'
// The integration test needs the dev server on :3000 AND a reachable DATABASE_URL
// (read from .env.local) so it can clean up its own counter rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, secondsToWindowEnd } from "../src/lib/rate-limit-core.ts";

// ── unit: decide() ────────────────────────────────────────────
// decide() is pure window math; these limits are a local fixture, not the
// app's LIMITS table. Since the guest tier was removed, LIMITS entries are
// now a flat { hour, day } Pair keyed by Clerk user id (see src/lib/rate-limit.ts).
const NOW = new Date("2026-08-28T10:30:00Z");
const LIMITS = { hour: 10, day: 30 };

test("decide: under both limits → ok", () => {
  assert.deepEqual(decide({ hour: 5, day: 5 }, LIMITS, NOW), { ok: true });
});

test("decide: exactly at the limit is still ok (the +1 call is blocked)", () => {
  assert.deepEqual(decide({ hour: 10, day: 10 }, LIMITS, NOW), { ok: true });
});

test("decide: one over the hour limit → blocked, retryAfter = seconds to :00", () => {
  const v = decide({ hour: 11, day: 12 }, LIMITS, NOW);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfter, 1800); // 10:30 → 11:00
});

test("decide: day limit takes precedence over hour", () => {
  const v = decide({ hour: 3, day: 31 }, LIMITS, NOW);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfter, secondsToWindowEnd("day", NOW)); // to next UTC midnight
});

// ── integration: burst a compute route ───────────────────────
// Removed. The compute routes are now hard auth-gated (src/proxy.ts): a
// signed-out POST 401s at the proxy before the limiter runs, and the limiter
// no longer does IP-based guest bucketing (buckets are keyed by Clerk user id).
// A real limiter integration test now needs a signed-in Clerk session driving
// the burst — tracked as a follow-up.
test("rate-limit integration burst", { skip: "needs an authenticated Clerk session — see note above" }, () => {});
