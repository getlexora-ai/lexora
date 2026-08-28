// Pure rate-limit math — no imports, so it can be unit-tested directly
// (tests/rate-limit.test.mjs) without pulling in Next / Clerk / pg.

export type Pair = { hour: number; day: number };
export type Window = "hour" | "day";

/** Start of the current fixed window, in UTC. */
export function windowStart(win: Window, now: Date): Date {
  const d = new Date(now);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  if (win === "day") d.setUTCHours(0);
  return d;
}

/** Seconds until the current window rolls over (>= 1). */
export function secondsToWindowEnd(win: Window, now: Date): number {
  const end = new Date(now);
  end.setUTCMilliseconds(0);
  end.setUTCSeconds(0);
  if (win === "hour") {
    end.setUTCMinutes(60);
  } else {
    end.setUTCMinutes(0);
    end.setUTCHours(24);
  }
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

/**
 * Given the post-increment counts for a key and its limits, decide whether the
 * request is allowed. The (limit+1)th call in a window is the first blocked, so
 * exactly `limit` calls get through.
 */
export function decide(
  counts: { hour: number; day: number },
  limits: Pair,
  now: Date,
): { ok: true } | { ok: false; retryAfter: number } {
  if (counts.day > limits.day) return { ok: false, retryAfter: secondsToWindowEnd("day", now) };
  if (counts.hour > limits.hour) return { ok: false, retryAfter: secondsToWindowEnd("hour", now) };
  return { ok: true };
}
