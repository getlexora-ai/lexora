import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { decide, windowStart, type Pair, type Window } from "@/lib/rate-limit-core";

export { decide } from "@/lib/rate-limit-core";

// Routes that call paid external APIs (Gemini / LLMWhisperer).
export type ComputeRoute =
  | "extract"
  | "analyse"
  | "generate"
  | "refine"
  | "contract-edit"
  | "chat"
  | "reanalyse"
  | "clause-search"
  | "template-vars";

/**
 * Per-key request caps. Single source of truth — tune from the KPI
 * (rate_limit_blocks ÷ total compute requests).
 *
 * Every compute route is auth-gated (see `src/proxy.ts`), so there are no
 * anonymous callers: every bucket is keyed by Clerk user id.
 */
export const LIMITS: Record<ComputeRoute | "compute", Pair> = {
  extract:         { hour: 15,  day: 40  },
  analyse:         { hour: 20,  day: 60  },
  generate:        { hour: 15,  day: 40  },
  refine:          { hour: 40,  day: 150 },
  "contract-edit": { hour: 40,  day: 150 },
  chat:            { hour: 60,  day: 200 },
  // the user cap stops a runaway re-analyse loop
  reanalyse:       { hour: 20,  day: 60  },
  // clause-library semantic search — one cheap embedding call per query
  "clause-search": { hour: 60,  day: 200 },
  // LLM-assisted template de-identification (from the "Save as template" flow)
  "template-vars": { hour: 15,  day: 40  },
  // global guard across ALL compute routes for one user
  compute:         { hour: 200, day: 600 },
};

/** Atomic upsert-increment; returns the new count for this key+window. */
async function bump(baseKey: string, win: Window, now: Date): Promise<number> {
  const rows = await query<{ count: number }>(
    `insert into rate_limits (bucket_key, window_start, count)
     values ($1, $2, 1)
     on conflict (bucket_key, window_start)
     do update set count = rate_limits.count + 1
     returning count`,
    [`${baseKey}:${win[0]}`, windowStart(win, now)],
  );
  return rows[0]?.count ?? 1;
}

/**
 * Call at the very top of a compute route's POST handler:
 *
 *   const limited = await enforceRateLimit(req, "analyse");
 *   if (limited) return limited;
 *
 * Returns a 429 NextResponse when the caller is over the limit, or null to
 * proceed. Fails open — a limiter/DB outage must not break analysis. Also
 * returns null when there is no Clerk user id to key on: compute routes are
 * auth-gated upstream, so this only happens outside a request scope.
 */
export async function enforceRateLimit(
  req: Request,
  route: ComputeRoute,
): Promise<NextResponse | null> {
  void req; // kept for signature stability; buckets are keyed by user id now

  let userId: string | null = null;
  try {
    userId = await currentUserId();
  } catch {
    // auth() outside a request scope (e.g. some test contexts)
  }
  if (!userId) return null;

  const now = new Date();
  const idPart = `u:${userId}`;
  const routeKey = `${route}:${idPart}`;
  const globalKey = `compute:${idPart}`;
  const routeLimits = LIMITS[route];
  const globalLimits = LIMITS.compute;

  try {
    const [rh, rd, gh, gd] = await Promise.all([
      bump(routeKey, "hour", now),
      bump(routeKey, "day", now),
      bump(globalKey, "hour", now),
      bump(globalKey, "day", now),
    ]);

    const routeVerdict = decide({ hour: rh, day: rd }, routeLimits, now);
    const globalVerdict = decide({ hour: gh, day: gd }, globalLimits, now);

    const blocked = !routeVerdict.ok
      ? { verdict: routeVerdict, key: routeKey }
      : !globalVerdict.ok
        ? { verdict: globalVerdict, key: globalKey }
        : null;

    if (blocked) {
      await query(
        `insert into rate_limit_blocks (route, scope, bucket_key) values ($1, $2, $3)`,
        [route, "user", blocked.key],
      ).catch(() => {});
      const retryAfter = blocked.verdict.retryAfter;
      return NextResponse.json(
        { error: "rate_limited", retry_after: retryAfter, scope: "user" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  } catch (err) {
    console.error("[rate-limit] check failed, allowing request:", err);
    return null;
  }

  // Opportunistic cleanup of stale rows.
  if (Math.random() < 0.01) {
    query(`delete from rate_limits where window_start < now() - interval '2 days'`).catch(() => {});
  }

  return null;
}
