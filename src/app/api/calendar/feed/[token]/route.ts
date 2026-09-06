import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import {
  buildFeedCached,
  feedValidators,
  resolveFeedToken,
  touchFeedToken,
  FEED_REFRESH_MINUTES,
} from "@/lib/calendar";
import { decide, windowStart, type Window } from "@/lib/rate-limit-core";

// A public, unauthenticated endpoint (a calendar app cannot hold a Clerk
// session), so it carries its own IP-keyed limit like /api/contact.
//
// Two buckets. The first is generous: a household or office behind one NAT can
// have several devices polling several feeds. The second counts only MISSES,
// which is what token brute-forcing looks like, and is tight.
const POLL_LIMIT = { hour: 120, day: 1000 };
const MISS_LIMIT = { hour: 20, day: 100 };

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

async function bump(key: string, win: Window, now: Date): Promise<number> {
  const rows = await query<{ count: number }>(
    `insert into rate_limits (bucket_key, window_start, count)
     values ($1, $2, 1)
     on conflict (bucket_key, window_start)
     do update set count = rate_limits.count + 1
     returning count`,
    [`${key}:${win[0]}`, windowStart(win, now)],
  );
  return rows[0]?.count ?? 1;
}

/** Fixed-window IP limit. Fails open — a limiter outage must not break feeds. */
async function rateLimited(
  key: string,
  limit: { hour: number; day: number },
): Promise<number | null> {
  const now = new Date();
  try {
    const [h, d] = await Promise.all([bump(key, "hour", now), bump(key, "day", now)]);
    const verdict = decide({ hour: h, day: d }, limit, now);
    if (!verdict.ok) return verdict.retryAfter;
  } catch (err) {
    console.error("[calendar/feed] rate-limit check failed, allowing:", err);
  }
  return null;
}

type Params = { params: Promise<{ token: string }> };

const tooMany = (retryAfter: number) =>
  new NextResponse("Too many requests\n", {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "Content-Type": "text/plain; charset=utf-8" },
  });

// A bad token is NOT a 401: a 401 would confirm that the URL shape is right and
// invite a retry with credentials. There is nothing here to authenticate as.
const notFound = () =>
  new NextResponse("Not found\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

// GET /api/calendar/feed/<token>.ics — the read-only iCalendar subscription.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ip = clientIp(req);
    const pollRetry = await rateLimited(`calfeed:ip:${ip}`, POLL_LIMIT);
    if (pollRetry !== null) return tooMany(pollRetry);

    // The route is reached as ".../<token>.ics"; the extension is cosmetic but
    // some clients insist on it before they will subscribe.
    const { token: raw } = await params;
    const token = raw.replace(/\.ics$/i, "");

    const userId = await resolveFeedToken(token);
    if (!userId) {
      const missRetry = await rateLimited(`calfeed:miss:${ip}`, MISS_LIMIT);
      if (missRetry !== null) return tooMany(missRetry);
      return notFound();
    }

    // Conditional GET: two index reads answer a poll that changed nothing,
    // instead of re-serialising the whole calendar. Most polls land here.
    const validators = await feedValidators(userId);
    const ifNoneMatch = req.headers.get("if-none-match");
    const ifModifiedSince = req.headers.get("if-modified-since");
    const unchanged = ifNoneMatch
      ? ifNoneMatch === validators.etag
      : ifModifiedSince === validators.lastModified;

    if (unchanged) {
      touchFeedToken(token, req.headers.get("user-agent"));
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: validators.etag,
          "Last-Modified": validators.lastModified,
          "Cache-Control": `private, max-age=${FEED_REFRESH_MINUTES * 60}`,
        },
      });
    }

    const feed = await buildFeedCached(userId);
    touchFeedToken(token, req.headers.get("user-agent"));

    return new NextResponse(feed.ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="lexora.ics"',
        // From the cached body, so the validator always describes what we sent.
        ETag: feed.etag,
        "Last-Modified": feed.lastModified,
        // `private`: this body is one user's contract deadlines and must never
        // be held by a shared proxy.
        "Cache-Control": `private, max-age=${FEED_REFRESH_MINUTES * 60}, must-revalidate`,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    return errorResponse(err, "api/calendar/feed/[token]");
  }
}
