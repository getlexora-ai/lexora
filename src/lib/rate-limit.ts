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
  | "reanalyse";

type Tier = { guest: Pair; user: Pair };

/**
 * Per-key request caps. Single source of truth — tune from the KPI
 * (rate_limit_blocks ÷ total compute requests, split by scope).
 * Guests are keyed by IP; signed-in users by Clerk id.
 */
export const LIMITS: Record<ComputeRoute | "compute", Tier> = {
  extract:         { guest: { hour: 3,  day: 5   }, user: { hour: 15,  day: 40  } },
  analyse:         { guest: { hour: 4,  day: 8   }, user: { hour: 20,  day: 60  } },
  generate:        { guest: { hour: 3,  day: 6   }, user: { hour: 15,  day: 40  } },
  refine:          { guest: { hour: 10, day: 30  }, user: { hour: 40,  day: 150 } },
  "contract-edit": { guest: { hour: 10, day: 30  }, user: { hour: 40,  day: 150 } },
  chat:            { guest: { hour: 15, day: 40  }, user: { hour: 60,  day: 200 } },
  // guests can't reach reanalyse (auth-gated); the user cap stops a runaway loop
  reanalyse:       { guest: { hour: 0,  day: 0   }, user: { hour: 20,  day: 60  } },
  // global guard across ALL compute routes for one key
  compute:         { guest: { hour: 15, day: 25  }, user: { hour: 200, day: 600 } },
};

/** First hop of X-Forwarded-For, else X-Real-IP, else "unknown". */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

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
 * proceed. Fails open — a limiter/DB outage must not break analysis.
 */
export async function enforceRateLimit(
  req: Request,
  route: ComputeRoute,
): Promise<NextResponse | null> {
  let userId: string | null = null;
  try {
    userId = await currentUserId();
  } catch {
    // auth() outside a request scope (e.g. some test contexts) — treat as guest
  }

  const scope: "guest" | "user" = userId ? "user" : "guest";
  const idPart = userId ? `u:${userId}` : `ip:${clientIp(req)}`;
  const now = new Date();

  const routeKey = `${route}:${idPart}`;
  const globalKey = `compute:${idPart}`;
  const routeLimits = LIMITS[route][scope];
  const globalLimits = LIMITS.compute[scope];

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
        [route, scope, blocked.key],
      ).catch(() => {});
      const retryAfter = blocked.verdict.retryAfter;
      return NextResponse.json(
        { error: "rate_limited", retry_after: retryAfter, scope },
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
