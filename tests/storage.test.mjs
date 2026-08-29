// Pure unit tests for the pluggable original-file storage.
// No network, no DB. Drives the driver purely through env vars.
//   node --test tests/storage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  putOriginal,
  getOriginal,
  isStorageEnabled,
  buildKey,
} from "../src/lib/storage.ts";

const OPTS = { userId: "user_abc123", filename: "My Lease.pdf", contentType: "application/pdf" };

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  })();
}

test('"none" driver (STORAGE_DRIVER unset): storage is inert', async () => {
  await withEnv({ STORAGE_DRIVER: undefined, STORAGE_FS_DIR: undefined }, async () => {
    assert.equal(isStorageEnabled(), false);
    assert.equal(await putOriginal(Buffer.from("hello"), OPTS), null);
    assert.equal(await getOriginal("originals/user_abc123/whatever.pdf"), null);
  });
});

test('"none" driver (STORAGE_DRIVER="none"): storage is inert', async () => {
  await withEnv({ STORAGE_DRIVER: "none" }, async () => {
    assert.equal(isStorageEnabled(), false);
    assert.equal(await putOriginal(Buffer.from("hello"), OPTS), null);
    assert.equal(await getOriginal("some/key"), null);
  });
});

test("unknown driver name falls back to inert", async () => {
  await withEnv({ STORAGE_DRIVER: "gcs" }, async () => {
    assert.equal(isStorageEnabled(), false);
    assert.equal(await putOriginal(Buffer.from("x"), OPTS), null);
  });
});

test('"fs" driver without STORAGE_FS_DIR stays inert', async () => {
  await withEnv({ STORAGE_DRIVER: "fs", STORAGE_FS_DIR: undefined }, async () => {
    assert.equal(isStorageEnabled(), false);
    assert.equal(await putOriginal(Buffer.from("x"), OPTS), null);
  });
});

test("buildKey: user-namespaced, uuid-prefixed, sanitized filename", () => {
  const key = buildKey({ userId: "user_abc123", filename: "../../etc/My Lease!.pdf", contentType: "x" });
  assert.match(key, /^originals\/user_abc123\/[0-9a-f-]{36}-My_Lease_\.pdf$/);
});

test('"fs" driver: putOriginal -> getOriginal round-trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), "lexora-storage-"));
  try {
    await withEnv({ STORAGE_DRIVER: "fs", STORAGE_FS_DIR: dir }, async () => {
      assert.equal(isStorageEnabled(), true);

      // Include some non-text bytes to prove it is a byte-exact round-trip.
      const bytes = Buffer.concat([
        Buffer.from("%PDF-1.7 fake pdf bytes "),
        Buffer.from([0, 1, 2, 253, 254, 255]),
      ]);
      const key = await putOriginal(bytes, OPTS);

      assert.ok(typeof key === "string" && key.startsWith("originals/user_abc123/"));
      assert.match(key, /-My_Lease\.pdf$/);

      const got = await getOriginal(key);
      assert.ok(got, "expected a stored original back");
      assert.equal(got.contentType, "application/pdf");
      assert.ok(Buffer.isBuffer(got.body));
      assert.ok(got.body.equals(bytes), "round-tripped bytes must match");

      // Unknown key -> null, not a throw.
      assert.equal(await getOriginal("originals/user_abc123/does-not-exist.pdf"), null);

      // Path-traversal keys are rejected.
      assert.equal(await getOriginal("../../../etc/passwd"), null);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('"fs" driver: empty key short-circuits to null', async () => {
  const dir = await mkdtemp(join(tmpdir(), "lexora-storage-"));
  try {
    await withEnv({ STORAGE_DRIVER: "fs", STORAGE_FS_DIR: dir }, async () => {
      assert.equal(await getOriginal(""), null);
      const entries = await readdir(dir);
      assert.deepEqual(entries, []);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
