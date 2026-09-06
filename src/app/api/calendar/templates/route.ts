import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import {
  createTemplate,
  listTemplates,
  type CalendarTemplate,
  type EventKind,
  type ReminderChannel,
} from "@/lib/calendar";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// GET /api/calendar/templates?contract_type= — own templates plus every
// system-curated one, same visibility rule as the clause library.
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ templates: [] });

    const contractType = req.nextUrl.searchParams.get("contract_type") ?? undefined;
    return NextResponse.json({ templates: await listTemplates(userId, { contractType }) });
  } catch (err) {
    return errorResponse(err, "api/calendar/templates");
  }
}

// POST /api/calendar/templates — create a user-owned template. Curated rows are
// seeded, never created through the API.
export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new AppError(400, "bad_request", "Expected a JSON body.");

    const name = str(body.name);
    const titleTemplate = str(body.titleTemplate);
    if (!name || !titleTemplate) {
      throw new AppError(
        422,
        "invalid_template",
        "name and titleTemplate are required, e.g. \"Kündigungsfrist {{contract_name}}\".",
      );
    }

    const template = await createTemplate(userId, {
      name,
      titleTemplate,
      nameEn: str(body.nameEn) || null,
      titleTemplateEn: str(body.titleTemplateEn) || null,
      description: str(body.description) || null,
      kind: (str(body.kind) || undefined) as EventKind | undefined,
      contractType: str(body.contractType),
      anchor: (str(body.anchor) || undefined) as CalendarTemplate["anchor"] | undefined,
      offsetIso: str(body.offsetIso) || undefined,
      allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
      defaultTime: str(body.defaultTime) || null,
      defaultDurationMinutes:
        typeof body.defaultDurationMinutes === "number" ? body.defaultDurationMinutes : undefined,
      timeZone: str(body.timeZone) || null,
      rrule: str(body.rrule) || null,
      defaultReminders: Array.isArray(body.defaultReminders)
        ? body.defaultReminders.filter((r): r is string => typeof r === "string")
        : [],
      reminderChannel: (str(body.reminderChannel) || undefined) as ReminderChannel | undefined,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "api/calendar/templates");
  }
}
