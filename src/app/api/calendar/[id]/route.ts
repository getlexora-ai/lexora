import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { deleteEvent, getEvent, parseScope, updateEvent } from "@/lib/calendar";

type Params = { params: Promise<{ id: string }> };

/**
 * The occurrence a scoped edit applies to, as its ORIGINAL start (the RFC 5545
 * RECURRENCE-ID) — not wherever a previous edit moved it. Required for
 * scope=this and scope=this_and_future.
 */
function occurrenceParam(req: NextRequest): Date | null {
  const raw = req.nextUrl.searchParams.get("occurrence");
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(422, "invalid_occurrence", '"occurrence" must be an ISO date-time.');
  }
  return d;
}

// GET /api/calendar/[id] — one event the caller owns.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const { id } = await params;
    const event = await getEvent(id, userId);
    if (!event) throw new AppError(404, "not_found", "Event not found.");
    return NextResponse.json({ event });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]");
  }
}

// PATCH /api/calendar/[id]?scope=this|this_and_future|all&occurrence=<iso>
//
//   all (default)     edit the series; every occurrence follows.
//   this              write an override for one occurrence.
//   this_and_future   cap the series and start a new one from the occurrence.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const { id } = await params;
    const scope = parseScope(req.nextUrl.searchParams.get("scope"));
    const occurrence = occurrenceParam(req);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new AppError(400, "bad_request", "Expected a JSON body.");

    const event = await updateEvent(id, userId, body, scope, occurrence);
    // Null here means either "no such event of yours" or, for scope=this, a
    // conflicting concurrent write. Both are honestly a 404 to this caller.
    if (!event) throw new AppError(404, "not_found", "Event not found.");
    return NextResponse.json({ event });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]");
  }
}

// DELETE /api/calendar/[id]?scope=…&occurrence=<iso>
//
//   all (default)     soft-delete the series and its overrides.
//   this              add the occurrence to EXDATE.
//   this_and_future   cap the series with UNTIL.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const { id } = await params;
    const scope = parseScope(req.nextUrl.searchParams.get("scope"));
    const occurrence = occurrenceParam(req);

    const ok = await deleteEvent(id, userId, scope, occurrence);
    if (!ok) throw new AppError(404, "not_found", "Event not found.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]");
  }
}
