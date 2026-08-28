// Rate limiter — pure unit tests + one integration test against the dev server.
//   node --test 'tests/**/*.test.mjs'
// The integration test needs the dev server on :3000 AND a reachable DATABASE_URL
// (read from .env.local) so it can clean up its own counter rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, secondsToWindowEnd } from "../src/lib/rate-limit-core.ts";

// ── unit: decide() ────────────────────────────────────────────
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

// ── integration: burst /api/refine as a guest ─────────────────
const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const TEST_IP = "203.0.113.77"; // TEST-NET-3, won't collide with a real client
const GUEST_HOUR_LIMIT = 10;    // LIMITS.refine.guest.hour

function dbUrl() {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m);
    return m?.[1];
  } catch { return undefined; }
}

async function withDb(fn) {
  const url = dbUrl();
  if (!url) return { ok: false, reason: "no DATABASE_URL in .env.local" };
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await fn(c);
    return { ok: true };
  } catch (e) {
    if (e.code === "42P01") return { ok: false, reason: "run db/003_rate_limits.sql first" };
    throw e;
  } finally {
    await c.end();
  }
}

const cleanup = () =>
  withDb(async (c) => {
    await c.query("delete from rate_limits where bucket_key like $1", [`refine:ip:${TEST_IP}:%`]);
    await c.query("delete from rate_limits where bucket_key like $1", [`compute:ip:${TEST_IP}:%`]);
    await c.query("delete from rate_limit_blocks where bucket_key like $1", [`%:ip:${TEST_IP}%`]);
  });

test("guest refine burst: 11th request in the hour is 429 with Retry-After", async (t) => {
  const prep = await cleanup();
  if (!prep.ok) { t.skip(prep.reason); return; }
  t.after(cleanup);

  const hit = (n) =>
    fetch(BASE + "/api/refine", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": TEST_IP },
      body: JSON.stringify({}), // invalid body → 400 while allowed, never reaches Gemini
    }).then((r) => r.status);

  const statuses = [];
  for (let i = 1; i <= GUEST_HOUR_LIMIT + 2; i++) statuses.push(await hit(i));

  // First N are the handler's own 400 (bad body); the limiter let them through.
  for (let i = 0; i < GUEST_HOUR_LIMIT; i++) {
    assert.notEqual(statuses[i], 429, `request ${i + 1} should not be rate-limited`);
  }
  // The (N+1)th and beyond are blocked.
  assert.equal(statuses[GUEST_HOUR_LIMIT], 429);
  assert.equal(statuses[GUEST_HOUR_LIMIT + 1], 429);

  const blocked = await fetch(BASE + "/api/refine", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": TEST_IP },
    body: JSON.stringify({}),
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.deepEqual(await blocked.json(), {
    error: "rate_limited",
    retry_after: Number(blocked.headers.get("retry-after")),
    scope: "guest",
  });
});
