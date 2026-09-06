import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import {
  createEvent,
  listOccurrencesCached,
  type EventKind,
  type ReminderChannel,
} from "@/lib/calendar";

// The window a client may ask for in one call. Expansion is linear in the
// range, so an unbounded ?from/?to is a free way to burn CPU.
const MAX_RANGE_DAYS = 1100; // ~3 years
const DEFAULT_PAST_DAYS = 30;
const DEFAULT_FUTURE_DAYS = 365;

function parseDate(value: string | null, fallback: Date, field: string): Date {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(422, "invalid_date", `"${field}" must be an ISO date-time.`);
  }
  return d;
}

// GET /api/calendar?from=&to= — the signed-in user's occurrences in a range.
// Signed-out callers get an empty list, same as /api/contracts.
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ occurrences: [] });

    const sp = req.nextUrl.searchParams;
    const now = Date.now();
    const from = parseDate(sp.get("from"), new Date(now - DEFAULT_PAST_DAYS * 86_400_000), "from");
    const to = parseDate(sp.get("to"), new Date(now + DEFAULT_FUTURE_DAYS * 86_400_000), "to");

    if (to <= from) {
      throw new AppError(422, "invalid_range", '"to" must be after "from".');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new AppError(
        422,
        "range_too_large",
        `Please request at most ${MAX_RANGE_DAYS} days at a time.`,
      );
    }

    const occurrences = await listOccurrencesCached(userId, from, to);
    return NextResponse.json({
      occurrences,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } catch (err) {
    return errorResponse(err, "api/calendar");
  }
}

type Body = {
  title?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  allDay?: unknown;
  timeZone?: unknown;
  description?: unknown;
  location?: unknown;
  kind?: unknown;
  rrule?: unknown;
  contractId?: unknown;
  reminders?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function reminderList(
  v: unknown,
): Array<{ offsetIso: string; channel?: ReminderChannel; label?: string | null }> {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (typeof item === "string") return [{ offsetIso: item }];
    if (item && typeof item === "object") {
      const r = item as Record<string, unknown>;
      const offsetIso = str(r.offsetIso);
      if (!offsetIso) return [];
      const channel = str(r.channel);
      return [
        {
          offsetIso,
          channel: channel === "email" || channel === "ics_alarm" ? channel : undefined,
          label: str(r.label) || null,
        },
      ];
    }
    return [];
  });
}

// POST /api/calendar — create an event (optionally recurring, optionally
// attached to one of the caller's contracts).
export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) throw new AppError(400, "bad_request", "Expected a JSON body.");

    const title = str(body.title);
    if (!title) throw new AppError(422, "invalid_title", "Please give the event a title.");
    if (!body.startsAt) {
      throw new AppError(422, "invalid_date", "startsAt is required.");
    }

    const contractId = str(body.contractId) || null;
    if (contractId && !(await ownsContract(contractId, userId))) {
      // Do not confirm that someone else's contract exists.
      throw new AppError(404, "not_found", "Contract not found.");
    }

    const event = await createEvent(userId, {
      title,
      startsAt: String(body.startsAt),
      endsAt: body.endsAt ? String(body.endsAt) : null,
      allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
      timeZone: str(body.timeZone) || null,
      description: str(body.description) || null,
      location: str(body.location) || null,
      kind: (str(body.kind) || undefined) as EventKind | undefined,
      rrule: str(body.rrule) || null,
      contractId,
      reminders: reminderList(body.reminders),
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "api/calendar");
  }
}
