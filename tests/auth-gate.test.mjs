// Integration test: verifies the API's auth gate for signed-out ("guest") requests.
// Requires the dev server running on http://localhost:3000 (npm run dev).
//   node --test tests/auth-gate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const j = (path, init) => fetch(BASE + path, init);
const SOME_ID = "00000000-0000-0000-0000-000000000000";

test("GET /api/contracts — guest sees an empty list, not an error", async () => {
  const res = await j("/api/contracts");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { contracts: [] });
});

test("POST /api/contracts — guest cannot save", async () => {
  const res = await j("/api/contracts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "x", contract_type: "NDA", extracted_text: "x",
      risk_level: "low", clauses: [],
    }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "sign_in_required" });
});

test("GET /api/contracts/[id] — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}`);
  assert.equal(res.status, 401);
});

test("PATCH /api/contracts/[id] — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "y" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/contracts/[id] — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}`, { method: "DELETE" });
  assert.equal(res.status, 401);
});

test("POST /api/contracts/[id]/versions — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/versions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quill_delta: { ops: [] } }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/contracts/[id]/chat — guest is blocked", async () => {
  const res = await j(`/api/contracts/${SOME_ID}/chat`);
  assert.equal(res.status, 401);
});

test("compute routes stay open to guests (analyse is not gated)", async () => {
  const res = await j("/api/analyse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "" }), // empty -> 400 from the handler, never 401
  });
  assert.notEqual(res.status, 401);
});
