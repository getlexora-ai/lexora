// Standalone Postgres pool for the RAG module.
//
// Mirrors src/lib/db.ts, but is import-alias-free and self-loads .env.local, so
// the CLI scripts (bare `node scripts/rag-*.mjs`, which cannot resolve the `@/`
// alias) and the Next.js app can both use it. In the app, .env is already
// populated and loadEnvLocal() is a no-op.

import { Pool } from "pg";
import { loadEnvLocal } from "./load-env.ts";

// Neon hands us `?sslmode=require&channel_binding=require`; we set TLS via the
// `ssl` option instead, so strip those params (see src/lib/db.ts).
function connectionString(): string | undefined {
  loadEnvLocal();
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw;
  }
}

const globalForRagDb = globalThis as unknown as { ragPool?: Pool };

/** Lazily-created shared pool. Small — only the generate route and CLI use it. */
export function ragPool(): Pool {
  if (globalForRagDb.ragPool) return globalForRagDb.ragPool;
  const cs = connectionString();
  if (!cs) {
    throw new Error(
      "DATABASE_URL is not set — cannot reach the RAG vector store. " +
        "Add it to lexora/.env.local or the environment.",
    );
  }
  const pool = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
  globalForRagDb.ragPool = pool;
  return pool;
}

/** Run a query and get the rows back. Params are $1, $2, … placeholders. */
export async function ragQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await ragPool().query(text, params as never[]);
  return res.rows as T[];
}

/** Close the pool. CLI scripts and tests call this so the process can exit. */
export async function endRagPool(): Promise<void> {
  const pool = globalForRagDb.ragPool;
  if (!pool) return;
  globalForRagDb.ragPool = undefined;
  await pool.end();
}
