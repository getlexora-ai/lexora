import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { saveContactMessage, forwardContactEmail } from "@/lib/contact";
import { decide, windowStart, type Window } from "@/lib/rate-limit-core";

// A public, unauthenticated endpoint, so it carries its own IP-keyed limit
// rather than the user-keyed compute limiter. Generous enough for a real
// person, tight enough to blunt a form spammer.
const LIMIT = { hour: 5, day: 20 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Fixed-window IP limit. Fails open — a limiter outage must not block contact. */
async function rateLimited(ip: string): Promise<number | null> {
  const now = new Date();
  const key = `contact:ip:${ip}`;
  try {
    const [h, d] = await Promise.all([
      bump(key, "hour", now),
      bump(key, "day", now),
    ]);
    const verdict = decide({ hour: h, day: d }, LIMIT, now);
    if (!verdict.ok) return verdict.retryAfter;
  } catch (err) {
    console.error("[contact] rate-limit check failed, allowing:", err);
  }
  return null;
}

type Body = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  /** Honeypot — real users never fill this; bots do. */
  website?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) throw new AppError(400, "bad_request", "Expected a JSON body.");

    // Silently accept and drop anything that trips the honeypot.
    if (str(body.website)) return NextResponse.json({ ok: true });

    const name = str(body.name);
    const email = str(body.email);
    const message = str(body.message);

    if (!name || name.length > 100) {
      throw new AppError(422, "invalid_name", "Please enter your name.");
    }
    if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
      throw new AppError(422, "invalid_email", "Please enter a valid email address.");
    }
    if (message.length < 10 || message.length > 5000) {
      throw new AppError(
        422,
        "invalid_message",
        "Please enter a message between 10 and 5000 characters.",
      );
    }

    const ip = clientIp(req);
    const retryAfter = await rateLimited(ip);
    if (retryAfter !== null) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many messages. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const input = {
      name,
      email,
      message,
      ip,
      userAgent: req.headers.get("user-agent"),
    };

    const id = await saveContactMessage(input);

    // The message is safely stored, so respond now and email a copy in the
    // background. Blocking the response on SMTP would leave the caller spinning
    // whenever the mail server is slow or unreachable. Railway runs a
    // persistent `next start`, so this promise finishes after the response.
    void forwardContactEmail(id, input).catch((err) => {
      console.error("[contact] background forward failed:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "api/contact");
  }
}
