// Integration test: auth gate for the user-correction clause endpoints
// (dismiss a false positive / add a missed clause).
// Requires the dev server running on http://localhost:3000 (npm run dev).
//   node --test tests/clause-corrections.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const j = (path, init) => fetch(BASE + path, init);
const SOME_ID = "00000000-0000-0000-0000-000000000000";

test("POST /api/contracts/[id]/clauses — guest cannot add a clause", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/clauses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "high",
      clause: "Clause X",
      passage: "some passage",
      issue: "some issue",
      suggestion: "some suggestion",
    }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "sign_in_required" });
});

test("PATCH /api/contracts/[id]/clauses/[clauseId] — guest cannot dismiss", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/clauses/${SOME_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "dismissed", dismissed_reason: "not applicable" }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "sign_in_required" });
});

test("PATCH /api/contracts/[id]/clauses/[clauseId] — guest cannot restore", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/clauses/${SOME_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "pending" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/contracts/[id]/clauses — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/clauses`);
  assert.equal(res.status, 401);
});
