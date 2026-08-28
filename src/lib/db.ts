import { Pool } from "pg";

// Neon hands us a URL with `?sslmode=require&channel_binding=require`. We set TLS
// explicitly via the `ssl` option below, so strip those params to avoid
// pg-connection-string's v3 deprecation warning about sslmode aliasing.
function connectionString(): string | undefined {
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

// Single shared connection pool. In dev, Next.js hot-reload re-evaluates this
// module on every change, so stash the pool on globalThis to avoid leaking
// connections until Neon drops the client.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: connectionString(),
    // Neon terminates TLS; encrypt without pinning the CA chain.
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

/** Run a query and get the rows back. Params are $1, $2, … placeholders. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

/** Run a query expected to return a single row (or none). */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
