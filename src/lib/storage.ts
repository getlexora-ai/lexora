// Pluggable storage for the *original* uploaded file (PDF/DOCX).
//
// Audit finding C2: today the upload is discarded after text extraction, so only
// lossy extracted text survives. This module keeps the original behind a small
// interface that is wired everywhere but **inert until a backend is configured**.
//
// Backend is chosen by the `STORAGE_DRIVER` env var:
//   - unset / "none"  → no-op. putOriginal() returns null, getOriginal() returns
//                        null, isStorageEnabled() is false. Nothing breaks.
//   - "fs"            → writes under `STORAGE_FS_DIR` (dev / self-host). Disabled
//                        (falls back to no-op) if `STORAGE_FS_DIR` is unset.
//   - "s3"            → TODO stub. Throws until a real driver is implemented with
//                        `@aws-sdk/client-s3` (not currently in node_modules).
//
// Keys are opaque and namespaced by user:
//   originals/<userId>/<uuid>-<safeFilename>

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface PutOriginalOpts {
  userId: string;
  filename: string;
  contentType: string;
}

export interface StoredOriginal {
  body: Buffer;
  contentType: string;
}

interface StorageDriver {
  enabled: boolean;
  put(bytes: Buffer, opts: PutOriginalOpts): Promise<string | null>;
  get(key: string): Promise<StoredOriginal | null>;
}

// ---------------------------------------------------------------------------
// key helpers
// ---------------------------------------------------------------------------

function safeFilename(name: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 128);
  return cleaned || "file";
}

function safeUserId(userId: string): string {
  const cleaned = (userId ?? "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 128);
  return cleaned || "anon";
}

/** Build the opaque, user-namespaced storage key for a fresh upload. */
export function buildKey(opts: PutOriginalOpts): string {
  return `originals/${safeUserId(opts.userId)}/${randomUUID()}-${safeFilename(opts.filename)}`;
}

// ---------------------------------------------------------------------------
// drivers
// ---------------------------------------------------------------------------

const noneDriver: StorageDriver = {
  enabled: false,
  async put() {
    return null;
  },
  async get() {
    return null;
  },
};

let warnedFsMisconfig = false;

function fsDriver(): StorageDriver {
  const baseDir = process.env.STORAGE_FS_DIR?.trim();
  if (!baseDir) {
    // Misconfigured: driver requested but no directory. Stay inert rather than
    // throw, so the upload path keeps working.
    if (!warnedFsMisconfig) {
      console.warn('[storage] STORAGE_DRIVER="fs" but STORAGE_FS_DIR is unset — storage disabled');
      warnedFsMisconfig = true;
    }
    return noneDriver;
  }

  const root = path.resolve(baseDir);

  // Reject keys that would escape the storage root.
  const resolveInRoot = (key: string): string | null => {
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) return null;
    return full;
  };

  return {
    enabled: true,

    async put(bytes: Buffer, opts: PutOriginalOpts): Promise<string | null> {
      const key = buildKey(opts);
      const full = resolveInRoot(key);
      if (!full) return null;
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      await fs.writeFile(
        `${full}.meta.json`,
        JSON.stringify({ contentType: opts.contentType, filename: safeFilename(opts.filename) }),
      );
      return key;
    },

    async get(key: string): Promise<StoredOriginal | null> {
      const full = resolveInRoot(key);
      if (!full) return null;
      let body: Buffer;
      try {
        body = await fs.readFile(full);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")) as {
          contentType?: string;
        };
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        // no sidecar — fall back to octet-stream
      }
      return { body, contentType };
    },
  };
}

const S3_STUB_MESSAGE = "s3 driver not implemented — install @aws-sdk/client-s3";

function s3Driver(): StorageDriver {
  // TODO(storage): implement with @aws-sdk/client-s3 once it is added to
  // package.json. Expected env: STORAGE_S3_BUCKET, STORAGE_S3_REGION,
  // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or an instance role), and an
  // optional STORAGE_S3_ENDPOINT for R2 / MinIO. put() should PutObject the
  // bytes under `buildKey(opts)` with ContentType; get() should GetObject and
  // return { body, contentType }.
  return {
    enabled: true,
    async put(): Promise<string | null> {
      throw new Error(S3_STUB_MESSAGE);
    },
    async get(): Promise<StoredOriginal | null> {
      throw new Error(S3_STUB_MESSAGE);
    },
  };
}

// ---------------------------------------------------------------------------
// resolution + public API
// ---------------------------------------------------------------------------

// Not memoized: env is read on every call so tests (and hot config changes) see
// the current driver. Resolution is cheap.
function resolveDriver(): StorageDriver {
  const name = (process.env.STORAGE_DRIVER ?? "none").trim().toLowerCase();
  switch (name) {
    case "":
    case "none":
      return noneDriver;
    case "fs":
      return fsDriver();
    case "s3":
      return s3Driver();
    default:
      console.warn(`[storage] unknown STORAGE_DRIVER="${name}" — storage disabled`);
      return noneDriver;
  }
}

/** True when a storage backend is configured and usable. */
export function isStorageEnabled(): boolean {
  return resolveDriver().enabled;
}

/**
 * Persist the uploaded original. Returns an opaque storage key, or `null` when
 * storage is disabled (the default). Never rejects for the "disabled" case.
 */
export function putOriginal(bytes: Buffer, opts: PutOriginalOpts): Promise<string | null> {
  const driver = resolveDriver();
  if (!driver.enabled) return Promise.resolve(null);
  return driver.put(bytes, opts);
}

/**
 * Fetch a previously stored original by its key. Returns `null` when storage is
 * disabled, the key is empty, or nothing is stored under that key.
 */
export function getOriginal(key: string): Promise<StoredOriginal | null> {
  if (!key) return Promise.resolve(null);
  const driver = resolveDriver();
  if (!driver.enabled) return Promise.resolve(null);
  return driver.get(key);
}
