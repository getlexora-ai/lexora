import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import {
  addReminder,
  deleteReminder,
  getEvent,
  listReminders,
  type ReminderChannel,
} from "@/lib/calendar";

type Params = { params: Promise<{ id: string }> };

// GET /api/calendar/[id]/reminders — lead times on one event.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const { id } = await params;
    if (!(await getEvent(id, userId))) {
      throw new AppError(404, "not_found", "Event not found.");
    }
    return NextResponse.json({ reminders: await listReminders(id, userId) });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]/reminders");
  }
}

// POST /api/calendar/[id]/reminders — add a lead time.
// Body: { offsetIso: "-P7D", channel?: "email" | "ics_alarm", label?: string }
//
// Offsets must be exact (no years or months): "three months before the contract
// ends" is a Kündigungsfrist deadline in its own right, not a lead time on one.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new AppError(400, "bad_request", "Expected a JSON body.");

    const offsetIso = typeof body.offsetIso === "string" ? body.offsetIso.trim() : "";
    if (!offsetIso) {
      throw new AppError(422, "invalid_reminder_offset", "offsetIso is required, e.g. -P7D.");
    }
    const rawChannel = typeof body.channel === "string" ? body.channel : "";

    const reminder = await addReminder(id, userId, {
      offsetIso,
      channel:
        rawChannel === "email" || rawChannel === "ics_alarm"
          ? (rawChannel as ReminderChannel)
          : undefined,
      label: typeof body.label === "string" ? body.label.trim() || null : null,
    });
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]/reminders");
  }
}

// DELETE /api/calendar/[id]/reminders?reminderId=<uuid>
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    await params; // the event id is implied by the reminder; keep the URL honest
    const reminderId = req.nextUrl.searchParams.get("reminderId");
    if (!reminderId) {
      throw new AppError(400, "bad_request", "reminderId is required.");
    }

    const ok = await deleteReminder(reminderId, userId);
    if (!ok) throw new AppError(404, "not_found", "Reminder not found.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "api/calendar/[id]/reminders");
  }
}
