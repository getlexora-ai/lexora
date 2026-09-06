/**
 * Data layer + domain helpers for calendar events (see db/012_calendar_events.sql
 * and docs/calendar/design.md).
 *
 * Shape of the feature:
 *   * The DB is the source of truth. Users pull dates into their real calendar
 *     through a per-user read-only iCalendar subscription — no OAuth, no legal
 *     data handed to a US calendar processor, no two-way sync to reconcile.
 *   * One row per SERIES holding an RFC 5545 RRULE; occurrences are expanded at
 *     read time (src/lib/calendar-rrule.ts). Single-occurrence edits become
 *     override child rows, exactly as RFC 5545 models them.
 *   * Ownership is enforced here, not in the DB: every query is scoped by
 *     user_id, so "not yours" and "does not exist" are the same 404.
 *
 * Env:
 *   CALENDAR_FEED_BASE_URL   public origin used to build subscription URLs,
 *                            e.g. "https://app.getlexora.de". Falls back to
 *                            NEXT_PUBLIC_APP_URL, then a relative path.
 *   SMTP_*                   reused from src/lib/contact.ts by the (unbuilt)
 *                            reminder worker.
 */

import { createHash, randomBytes } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  boundRRule,
  expandOccurrences,
  isoDurationSeconds,
  parseIsoDuration,
  rruleError,
  seriesEndAt,
  shiftInstant,
  toWall,
  fromWall,
  type Occurrence,
  type Series,
} from "@/lib/calendar-rrule";
import { buildCalendar, type IcsAlarm, type IcsEvent } from "@/lib/calendar-ics";

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** How far the .ics feed reaches. Past events keep a subscriber's history sane. */
const FEED_PAST_DAYS = 365;
const FEED_FUTURE_DAYS = 730;
/** Advertised polling cadence. Calendar clients treat this as a hint. */
export const FEED_REFRESH_MINUTES = 240;

export type EventKind = "deadline" | "notice" | "renewal" | "review" | "payment" | "other";
export type EventOrigin = "manual" | "derived";
export type ReminderChannel = "email" | "ics_alarm";
export type RecurrenceScope = "this" | "this_and_future" | "all";

export const EVENT_KINDS: readonly EventKind[] = [
  "deadline", "notice", "renewal", "review", "payment", "other",
];
const KIND_SET = new Set<string>(EVENT_KINDS);
const CHANNELS = new Set<string>(["email", "ics_alarm"]);
const SCOPES = new Set<string>(["this", "this_and_future", "all"]);

// ── row types ───────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  user_id: string;
  contract_id: string | null;
  template_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  all_day: boolean;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  rrule: string | null;
  exdates: Date[];
  series_end_at: Date | null;
  recurrence_parent_id: string | null;
  recurrence_id: Date | null;
  split_from_id: string | null;
  origin: EventOrigin;
  source_key: string | null;
  user_modified: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CalendarReminder = {
  id: string;
  event_id: string;
  offset_iso: string;
  offset_seconds: number;
  channel: ReminderChannel;
  label: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CalendarTemplate = {
  id: string;
  user_id: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  kind: EventKind;
  contract_type: string;
  title_template: string;
  title_template_en: string | null;
  anchor: "contract_start" | "contract_end" | "notice_deadline" | "signature_date" | "custom";
  offset_iso: string;
  all_day: boolean;
  default_time: string | null;
  default_duration_minutes: number;
  time_zone: string;
  rrule: string | null;
  default_reminders: string[];
  reminder_channel: ReminderChannel;
  source: "curated" | "user";
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
  /** true when this row is system-curated (not editable by the caller). */
  readonly?: boolean;
};

export type FeedToken = {
  id: string;
  user_id: string;
  token: string;
  label: string | null;
  last_used_at: Date | null;
  use_count: string;
  created_at: Date;
};

const EVENT_COLUMNS = `
  id, user_id, contract_id, template_id, title, description, location, kind,
  all_day, starts_at, ends_at, time_zone, rrule, exdates, series_end_at,
  recurrence_parent_id, recurrence_id, split_from_id, origin, source_key,
  user_modified, created_at, updated_at
`;

/** Same list, aliased, for the queries that join calendar_events as `e`. */
const EVENT_COLUMNS_E = `
  e.id, e.user_id, e.contract_id, e.template_id, e.title, e.description,
  e.location, e.kind, e.all_day, e.starts_at, e.ends_at, e.time_zone, e.rrule,
  e.exdates, e.series_end_at, e.recurrence_parent_id, e.recurrence_id,
  e.split_from_id, e.origin, e.source_key, e.user_modified, e.created_at,
  e.updated_at
`;

const REMINDER_COLUMNS = `
  id, event_id, offset_iso, offset_seconds, channel, label, created_at, updated_at
`;

/** Same list, aliased, for the queries that join calendar_event_reminders as `r`. */
const REMINDER_COLUMNS_R = `
  r.id, r.event_id, r.offset_iso, r.offset_seconds, r.channel, r.label,
  r.created_at, r.updated_at
`;

const TEMPLATE_COLUMNS = `
  id, user_id, name, name_en, description, kind, contract_type, title_template,
  title_template_en, anchor, offset_iso, all_day, default_time,
  default_duration_minutes, time_zone, rrule, default_reminders,
  reminder_channel, source, is_default, created_at, updated_at,
  (user_id is null) as readonly
`;

// ── cache tags ──────────────────────────────────────────────────────────────

/** Everything derived from this user's events (list views, occurrence expansion). */
export const calendarTag = (userId: string) => `calendar:${userId}`;
/** The serialised .ics body + its ETag. Separate so a feed poll is cheap. */
export const calendarFeedTag = (userId: string) => `calendar:feed:${userId}`;
/** A contract's derived dates, for the contract detail page. */
export const calendarContractTag = (contractId: string) => `calendar:contract:${contractId}`;

/**
 * Invalidate after every write. Next 16 requires the two-argument form;
 * "max" gives stale-while-revalidate rather than a blocking miss.
 *
 * Wrapped: the reminder worker is a plain node process with no Next request
 * scope, where revalidateTag throws. A failed invalidation is a stale read at
 * worst — never a reason to fail the write that already committed.
 */
function invalidate(userId: string, contractId?: string | null): void {
  try {
    revalidateTag(calendarTag(userId), "max");
    revalidateTag(calendarFeedTag(userId), "max");
    if (contractId) revalidateTag(calendarContractTag(contractId), "max");
  } catch (err) {
    console.warn("[calendar] cache invalidation skipped (no request scope):", err);
  }
}

// ── validation ──────────────────────────────────────────────────────────────

function asDate(value: unknown, field: string): Date {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new AppError(422, "invalid_date", `${field} must be a valid ISO date-time.`);
  }
  return d;
}

export function parseScope(value: string | null): RecurrenceScope {
  if (!value) return "all";
  if (!SCOPES.has(value)) {
    throw new AppError(422, "invalid_scope", "scope must be this, this_and_future or all.");
  }
  return value as RecurrenceScope;
}

/**
 * Reminder offsets must be EXACT, so years and months are rejected: "three
 * months before the contract ends" is a Kündigungsfrist DEADLINE (its own
 * derived event), not a lead time on one.
 */
export function reminderOffsetSeconds(iso: string): number {
  const secs = isoDurationSeconds(iso);
  if (secs === null) {
    throw new AppError(
      422,
      "invalid_reminder_offset",
      "Reminder offsets must be exact ISO-8601 durations without years or months, e.g. -P7D or -PT1H.",
    );
  }
  if (secs > 0) {
    throw new AppError(422, "invalid_reminder_offset", "Reminder offsets must not be positive.");
  }
  if (secs < -370 * 86_400) {
    throw new AppError(422, "invalid_reminder_offset", "Reminder lead time may not exceed one year.");
  }
  return secs;
}

function validateRRule(rrule: string | null): string | null {
  if (!rrule) return null;
  const trimmed = rrule.trim().replace(/^RRULE:/i, "");
  const err = rruleError(trimmed);
  if (err) throw new AppError(422, "invalid_rrule", err);
  return trimmed;
}

/** Guard against an unknown IANA zone reaching Intl and throwing mid-expansion. */
function validateTimeZone(tz: string | null | undefined): string {
  const zone = (tz ?? "").trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new AppError(422, "invalid_time_zone", `"${zone}" is not a known time zone.`);
  }
  return zone;
}

function toSeries(row: CalendarEvent): Series {
  return {
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.time_zone,
    rrule: row.rrule,
    exdates: row.exdates ?? [],
  };
}

// ── reads ───────────────────────────────────────────────────────────────────

/**
 * Every row needed to render [from, to): the user's series that overlap the
 * range, plus their override rows, plus any override that has been MOVED into
 * the range from a series outside it. One round trip.
 */
export async function listEventRows(
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  return query<CalendarEvent>(
    `with masters as (
       select ${EVENT_COLUMNS}
         from calendar_events
        where user_id = $1
          and deleted_at is null
          and recurrence_parent_id is null
          and starts_at < $3
          and (series_end_at is null or series_end_at > $2)
     )
     select * from masters
     union all
     select ${EVENT_COLUMNS}
       from calendar_events o
      where o.user_id = $1
        and o.deleted_at is null
        and o.recurrence_parent_id is not null
        and (
          o.recurrence_parent_id in (select id from masters)
          or (o.starts_at < $3 and o.ends_at > $2)
        )`,
    [userId, from, to],
  );
}

export type EventOccurrence = Occurrence & {
  /** The series this occurrence belongs to. */
  seriesId: string;
  /** The row that actually supplied the fields — the override, when there is one. */
  eventId: string;
  isOverride: boolean;
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  allDay: boolean;
  timeZone: string;
  contractId: string | null;
  origin: EventOrigin;
  userModified: boolean;
};

/** Fold master series and their overrides into a flat, sorted occurrence list. */
export function expandRows(
  rows: CalendarEvent[],
  from: Date,
  to: Date,
): EventOccurrence[] {
  const masters = rows.filter((r) => r.recurrence_parent_id === null);
  const overrides = rows.filter((r) => r.recurrence_parent_id !== null);

  const byParent = new Map<string, Map<number, CalendarEvent>>();
  for (const o of overrides) {
    if (!o.recurrence_id) continue;
    const slot = byParent.get(o.recurrence_parent_id!) ?? new Map<number, CalendarEvent>();
    slot.set(o.recurrence_id.getTime(), o);
    byParent.set(o.recurrence_parent_id!, slot);
  }

  const shape = (
    row: CalendarEvent,
    occ: Occurrence,
    seriesId: string,
    isOverride: boolean,
  ): EventOccurrence => ({
    ...occ,
    seriesId,
    eventId: row.id,
    isOverride,
    title: row.title,
    description: row.description,
    location: row.location,
    kind: row.kind,
    allDay: row.all_day,
    timeZone: row.time_zone,
    contractId: row.contract_id,
    origin: row.origin,
    userModified: row.user_modified,
  });

  const out: EventOccurrence[] = [];
  const emittedOverrides = new Set<string>();

  for (const master of masters) {
    const slot = byParent.get(master.id);
    for (const occ of expandOccurrences(toSeries(master), from, to)) {
      const override = slot?.get(occ.recurrenceId.getTime());
      if (!override) {
        out.push(shape(master, occ, master.id, false));
        continue;
      }
      emittedOverrides.add(override.id);
      if (override.starts_at < to && override.ends_at > from) {
        out.push(
          shape(
            override,
            { start: override.starts_at, end: override.ends_at, recurrenceId: occ.recurrenceId },
            master.id,
            true,
          ),
        );
      }
    }
  }

  // Overrides whose series lies outside the window but which were moved in.
  for (const o of overrides) {
    if (emittedOverrides.has(o.id)) continue;
    if (o.starts_at >= to || o.ends_at <= from) continue;
    out.push(
      shape(
        o,
        { start: o.starts_at, end: o.ends_at, recurrenceId: o.recurrence_id ?? o.starts_at },
        o.recurrence_parent_id ?? o.id,
        true,
      ),
    );
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/** Occurrences in [from, to), API-shaped (ISO strings, JSON-safe). */
export type SerialisedOccurrence = Omit<EventOccurrence, "start" | "end" | "recurrenceId"> & {
  start: string;
  end: string;
  recurrenceId: string;
};

function serialise(occ: EventOccurrence): SerialisedOccurrence {
  return {
    ...occ,
    start: occ.start.toISOString(),
    end: occ.end.toISOString(),
    recurrenceId: occ.recurrenceId.toISOString(),
  };
}

export async function listOccurrences(
  userId: string,
  from: Date,
  to: Date,
): Promise<SerialisedOccurrence[]> {
  const cached = occurrenceCacheGet(userId, from, to);
  if (cached) return cached;
  const rows = await listEventRows(userId, from, to);
  const result = expandRows(rows, from, to).map(serialise);
  occurrenceCacheSet(userId, from, to, result);
  return result;
}

/** One event the user owns (master or override), or null. */
export async function getEvent(id: string, userId: string): Promise<CalendarEvent | null> {
  return queryOne<CalendarEvent>(
    `select ${EVENT_COLUMNS} from calendar_events
      where id = $1 and user_id = $2 and deleted_at is null`,
    [id, userId],
  );
}

/** A contract's dates, for the contract detail view. */
export async function listContractEvents(
  contractId: string,
  userId: string,
): Promise<CalendarEvent[]> {
  return query<CalendarEvent>(
    `select ${EVENT_COLUMNS} from calendar_events
      where contract_id = $1 and user_id = $2 and deleted_at is null
        and recurrence_parent_id is null
      order by starts_at`,
    [contractId, userId],
  );
}

// ── writes ──────────────────────────────────────────────────────────────────

export type CreateEventInput = {
  title: string;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  allDay?: boolean;
  timeZone?: string | null;
  description?: string | null;
  location?: string | null;
  kind?: EventKind;
  rrule?: string | null;
  contractId?: string | null;
  templateId?: string | null;
  reminders?: Array<{ offsetIso: string; channel?: ReminderChannel; label?: string | null }>;
};

/** Default span: all-day events cover one day, timed ones 30 minutes. */
function defaultEnd(start: Date, allDay: boolean, timeZone: string): Date {
  if (!allDay) return new Date(start.getTime() + 30 * 60_000);
  const w = toWall(start, timeZone);
  return fromWall({ ...w, day: w.day + 1, hour: 0, minute: 0, second: 0 }, timeZone);
}

export async function createEvent(
  userId: string,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const title = input.title.trim();
  if (!title || title.length > 300) {
    throw new AppError(422, "invalid_title", "Please give the event a title (max 300 characters).");
  }
  if (input.kind && !KIND_SET.has(input.kind)) {
    throw new AppError(422, "invalid_kind", `Unknown event kind "${input.kind}".`);
  }

  const timeZone = validateTimeZone(input.timeZone);
  const allDay = input.allDay ?? true;
  const startsAt = asDate(input.startsAt, "startsAt");
  const endsAt = input.endsAt ? asDate(input.endsAt, "endsAt") : defaultEnd(startsAt, allDay, timeZone);
  if (endsAt < startsAt) {
    throw new AppError(422, "invalid_range", "The event cannot end before it starts.");
  }
  const rrule = validateRRule(input.rrule ?? null);
  const endAt = seriesEndAt({ startsAt, endsAt, timeZone, rrule, exdates: [] });

  // Validate every reminder BEFORE inserting the event, so a bad lead time is a
  // clean 422 rather than an orphaned event with no reminders on it.
  const reminders = input.reminders ?? [];
  for (const r of reminders) reminderOffsetSeconds(r.offsetIso.trim().toUpperCase());

  const row = await queryOne<CalendarEvent>(
    `insert into calendar_events
       (user_id, contract_id, template_id, title, description, location, kind,
        all_day, starts_at, ends_at, time_zone, rrule, series_end_at, origin)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual')
     returning ${EVENT_COLUMNS}`,
    [
      userId,
      input.contractId ?? null,
      input.templateId ?? null,
      title,
      input.description ?? null,
      input.location ?? null,
      input.kind ?? "deadline",
      allDay,
      startsAt,
      endsAt,
      timeZone,
      rrule,
      endAt,
    ],
  );
  if (!row) throw new Error("calendar event insert returned nothing");

  for (const r of reminders) {
    await addReminder(row.id, userId, r);
  }

  invalidate(userId, row.contract_id);
  return row;
}

const EDITABLE_EVENT_FIELDS = new Set([
  "title", "description", "location", "kind", "all_day",
  "starts_at", "ends_at", "time_zone", "rrule",
]);

export type EventPatch = Record<string, unknown>;

/** Normalise an incoming patch into (column, value) pairs we are willing to write. */
function normalisePatch(patch: EventPatch, base: CalendarEvent): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [rawKey, value] of Object.entries(patch)) {
    // Accept both camelCase (API) and snake_case (internal) spellings.
    const key = rawKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (!EDITABLE_EVENT_FIELDS.has(key)) continue;

    switch (key) {
      case "title": {
        const t = String(value ?? "").trim();
        if (!t || t.length > 300) {
          throw new AppError(422, "invalid_title", "Please give the event a title (max 300 characters).");
        }
        out.set("title", t);
        break;
      }
      case "kind":
        if (!KIND_SET.has(String(value))) {
          throw new AppError(422, "invalid_kind", `Unknown event kind "${String(value)}".`);
        }
        out.set("kind", value);
        break;
      case "all_day":
        out.set("all_day", Boolean(value));
        break;
      case "starts_at":
        out.set("starts_at", asDate(value, "startsAt"));
        break;
      case "ends_at":
        out.set("ends_at", asDate(value, "endsAt"));
        break;
      case "time_zone":
        out.set("time_zone", validateTimeZone(String(value)));
        break;
      case "rrule":
        out.set("rrule", validateRRule(value === null ? null : String(value)));
        break;
      default:
        out.set(key, value === "" ? null : value);
    }
  }

  const starts = (out.get("starts_at") as Date | undefined) ?? base.starts_at;
  const ends = (out.get("ends_at") as Date | undefined) ?? base.ends_at;
  if (ends < starts) {
    throw new AppError(422, "invalid_range", "The event cannot end before it starts.");
  }
  return out;
}

function seriesAfterPatch(base: CalendarEvent, patch: Map<string, unknown>): Series {
  return {
    startsAt: (patch.get("starts_at") as Date | undefined) ?? base.starts_at,
    endsAt: (patch.get("ends_at") as Date | undefined) ?? base.ends_at,
    timeZone: (patch.get("time_zone") as string | undefined) ?? base.time_zone,
    rrule: patch.has("rrule") ? (patch.get("rrule") as string | null) : base.rrule,
    exdates: base.exdates ?? [],
  };
}

async function writePatch(
  id: string,
  userId: string,
  patch: Map<string, unknown>,
  extra: Array<[string, unknown]> = [],
): Promise<CalendarEvent | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [col, value] of [...patch.entries(), ...extra]) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length === 0) return getEvent(id, userId);
  params.push(id, userId);
  return queryOne<CalendarEvent>(
    `update calendar_events set ${sets.join(", ")}
      where id = $${params.length - 1} and user_id = $${params.length} and deleted_at is null
      returning ${EVENT_COLUMNS}`,
    params,
  );
}

/**
 * Edit an event.
 *
 *  scope = "all"              patch the series row; every occurrence follows.
 *  scope = "this"             write an RFC 5545 override row for one occurrence.
 *  scope = "this_and_future"  cap the original series just before the
 *                             occurrence and start a new series from it.
 *
 * `occurrenceStart` is the RECURRENCE-ID (the occurrence's ORIGINAL start), not
 * wherever a previous edit moved it — that is what keeps the identity stable.
 */
export async function updateEvent(
  id: string,
  userId: string,
  patch: EventPatch,
  scope: RecurrenceScope = "all",
  occurrenceStart?: Date | null,
): Promise<CalendarEvent | null> {
  const base = await getEvent(id, userId);
  if (!base) return null;

  const fields = normalisePatch(patch, base);
  // A user touching a derived event freezes it: contract-date regeneration must
  // never silently discard a human decision.
  const markModified: Array<[string, unknown]> =
    base.origin === "derived" && !base.user_modified && fields.size > 0
      ? [["user_modified", true]]
      : [];

  if (scope === "all" || !base.rrule) {
    const next = seriesAfterPatch(base, fields);
    fields.set("series_end_at", seriesEndAt(next));
    const row = await writePatch(id, userId, fields, markModified);
    invalidate(userId, base.contract_id);
    return row;
  }

  if (!occurrenceStart) {
    throw new AppError(
      422,
      "occurrence_required",
      "Editing a single occurrence needs the occurrence's original start time.",
    );
  }

  if (scope === "this") {
    const start = (fields.get("starts_at") as Date | undefined) ?? occurrenceStart;
    const end =
      (fields.get("ends_at") as Date | undefined) ??
      new Date(start.getTime() + (base.ends_at.getTime() - base.starts_at.getTime()));
    const row = await queryOne<CalendarEvent>(
      `insert into calendar_events
         (user_id, contract_id, template_id, title, description, location, kind,
          all_day, starts_at, ends_at, time_zone, series_end_at,
          recurrence_parent_id, recurrence_id, origin, user_modified)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10,$12,$13,$14,$15)
       on conflict (recurrence_parent_id, recurrence_id)
         where recurrence_parent_id is not null
       do update set
         title = excluded.title, description = excluded.description,
         location = excluded.location, kind = excluded.kind,
         all_day = excluded.all_day, starts_at = excluded.starts_at,
         ends_at = excluded.ends_at, time_zone = excluded.time_zone,
         series_end_at = excluded.series_end_at, user_modified = true
       returning ${EVENT_COLUMNS}`,
      [
        userId,
        base.contract_id,
        base.template_id,
        (fields.get("title") as string | undefined) ?? base.title,
        (fields.get("description") as string | undefined) ?? base.description,
        (fields.get("location") as string | undefined) ?? base.location,
        (fields.get("kind") as EventKind | undefined) ?? base.kind,
        (fields.get("all_day") as boolean | undefined) ?? base.all_day,
        start,
        end, // $10, reused for series_end_at: an override is a single occurrence
        (fields.get("time_zone") as string | undefined) ?? base.time_zone,
        base.id,
        occurrenceStart,
        base.origin,
        base.origin === "derived",
      ],
    );
    invalidate(userId, base.contract_id);
    return row;
  }

  // scope === "this_and_future": split the series in two.
  const { before, after } = boundRRule(base.rrule, toSeries(base), occurrenceStart);

  const beforeSeries: Series = { ...toSeries(base), rrule: before };
  await query(
    `update calendar_events set rrule = $1, series_end_at = $2
      where id = $3 and user_id = $4`,
    [before, seriesEndAt(beforeSeries), base.id, userId],
  );

  const start = (fields.get("starts_at") as Date | undefined) ?? occurrenceStart;
  const end =
    (fields.get("ends_at") as Date | undefined) ??
    new Date(start.getTime() + (base.ends_at.getTime() - base.starts_at.getTime()));
  const timeZone = (fields.get("time_zone") as string | undefined) ?? base.time_zone;
  const rrule = fields.has("rrule") ? (fields.get("rrule") as string | null) : after;
  const tail: Series = { startsAt: start, endsAt: end, timeZone, rrule, exdates: [] };

  const row = await queryOne<CalendarEvent>(
    `insert into calendar_events
       (user_id, contract_id, template_id, title, description, location, kind,
        all_day, starts_at, ends_at, time_zone, rrule, exdates, series_end_at,
        split_from_id, origin, user_modified)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning ${EVENT_COLUMNS}`,
    [
      userId,
      base.contract_id,
      base.template_id,
      (fields.get("title") as string | undefined) ?? base.title,
      (fields.get("description") as string | undefined) ?? base.description,
      (fields.get("location") as string | undefined) ?? base.location,
      (fields.get("kind") as EventKind | undefined) ?? base.kind,
      (fields.get("all_day") as boolean | undefined) ?? base.all_day,
      start,
      end,
      timeZone,
      rrule,
      (base.exdates ?? []).filter((d) => d >= occurrenceStart),
      seriesEndAt(tail),
      base.id,
      base.origin,
      base.origin === "derived",
    ],
  );

  if (row) {
    // Reminders are per-series, so the new half needs its own copies.
    await query(
      `insert into calendar_event_reminders (event_id, offset_iso, offset_seconds, channel, label)
       select $1, offset_iso, offset_seconds, channel, label
         from calendar_event_reminders where event_id = $2
       on conflict do nothing`,
      [row.id, base.id],
    );
    // Overrides after the split belong to the new series.
    await query(
      `update calendar_events set recurrence_parent_id = $1
        where recurrence_parent_id = $2 and recurrence_id >= $3 and user_id = $4`,
      [row.id, base.id, occurrenceStart, userId],
    );
  }

  invalidate(userId, base.contract_id);
  return row;
}

/**
 * Delete an event.
 *
 *  scope = "all"              soft-delete the series and its overrides.
 *  scope = "this"             add the occurrence to EXDATE (RFC 5545's own way
 *                             of saying "this one is cancelled").
 *  scope = "this_and_future"  cap the series with UNTIL.
 */
export async function deleteEvent(
  id: string,
  userId: string,
  scope: RecurrenceScope = "all",
  occurrenceStart?: Date | null,
): Promise<boolean> {
  const base = await getEvent(id, userId);
  if (!base) return false;

  if (scope === "all" || !base.rrule) {
    await query(
      `update calendar_events set deleted_at = now()
        where user_id = $2 and deleted_at is null
          and (id = $1 or recurrence_parent_id = $1)`,
      [id, userId],
    );
    invalidate(userId, base.contract_id);
    return true;
  }

  if (!occurrenceStart) {
    throw new AppError(
      422,
      "occurrence_required",
      "Deleting a single occurrence needs the occurrence's original start time.",
    );
  }

  if (scope === "this") {
    await query(
      `update calendar_events
          set exdates = (select array_agg(distinct d)
                           from unnest(exdates || array[$3::timestamptz]) as d)
        where id = $1 and user_id = $2`,
      [id, userId, occurrenceStart],
    );
    await query(
      `update calendar_events set deleted_at = now()
        where recurrence_parent_id = $1 and recurrence_id = $2 and user_id = $3`,
      [id, occurrenceStart, userId],
    );
  } else {
    const { before } = boundRRule(base.rrule, toSeries(base), occurrenceStart);
    const truncated: Series = { ...toSeries(base), rrule: before };
    await query(
      `update calendar_events set rrule = $1, series_end_at = $2 where id = $3 and user_id = $4`,
      [before, seriesEndAt(truncated), id, userId],
    );
    await query(
      `update calendar_events set deleted_at = now()
        where recurrence_parent_id = $1 and recurrence_id >= $2 and user_id = $3`,
      [id, occurrenceStart, userId],
    );
  }

  invalidate(userId, base.contract_id);
  return true;
}

// ── reminders ───────────────────────────────────────────────────────────────

export async function listReminders(
  eventId: string,
  userId: string,
): Promise<CalendarReminder[]> {
  return query<CalendarReminder>(
    `select ${REMINDER_COLUMNS_R}
       from calendar_event_reminders r
       join calendar_events e on e.id = r.event_id
      where r.event_id = $1 and e.user_id = $2 and e.deleted_at is null
      order by r.offset_seconds desc`,
    [eventId, userId],
  );
}

export async function addReminder(
  eventId: string,
  userId: string,
  input: { offsetIso: string; channel?: ReminderChannel; label?: string | null },
): Promise<CalendarReminder> {
  const event = await getEvent(eventId, userId);
  if (!event) throw new AppError(404, "not_found", "Event not found.");

  const offsetIso = input.offsetIso.trim().toUpperCase();
  const seconds = reminderOffsetSeconds(offsetIso);
  const channel = input.channel ?? "ics_alarm";
  if (!CHANNELS.has(channel)) {
    throw new AppError(422, "invalid_channel", `Unknown reminder channel "${channel}".`);
  }

  const row = await queryOne<CalendarReminder>(
    `insert into calendar_event_reminders (event_id, offset_iso, offset_seconds, channel, label)
     values ($1,$2,$3,$4,$5)
     on conflict (event_id, offset_iso, channel)
     do update set label = excluded.label
     returning ${REMINDER_COLUMNS}`,
    [eventId, offsetIso, seconds, channel, input.label ?? null],
  );
  if (!row) throw new Error("reminder insert returned nothing");

  invalidate(userId, event.contract_id);
  return row;
}

export async function deleteReminder(
  reminderId: string,
  userId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string; contract_id: string | null }>(
    `delete from calendar_event_reminders r
      using calendar_events e
      where r.id = $1 and e.id = r.event_id and e.user_id = $2
      returning r.id, e.contract_id`,
    [reminderId, userId],
  );
  if (row) invalidate(userId, row.contract_id);
  return row !== null;
}

// ── templates ───────────────────────────────────────────────────────────────

/** Own templates plus every system-curated one, same rule as the clause library. */
export async function listTemplates(
  userId: string,
  opts: { contractType?: string } = {},
): Promise<CalendarTemplate[]> {
  const params: unknown[] = [userId];
  let filter = "";
  if (opts.contractType) {
    params.push(opts.contractType);
    filter = `and (contract_type = $2 or contract_type = '')`;
  }
  return query<CalendarTemplate>(
    `select ${TEMPLATE_COLUMNS} from calendar_event_templates
      where deleted_at is null and (user_id = $1 or user_id is null) ${filter}
      order by is_default desc, name`,
    params,
  );
}

export async function getTemplate(
  id: string,
  userId: string,
): Promise<CalendarTemplate | null> {
  return queryOne<CalendarTemplate>(
    `select ${TEMPLATE_COLUMNS} from calendar_event_templates
      where id = $1 and deleted_at is null and (user_id = $2 or user_id is null)`,
    [id, userId],
  );
}

export type CreateTemplateInput = {
  name: string;
  titleTemplate: string;
  anchor?: CalendarTemplate["anchor"];
  offsetIso?: string;
  kind?: EventKind;
  contractType?: string;
  description?: string | null;
  nameEn?: string | null;
  titleTemplateEn?: string | null;
  allDay?: boolean;
  defaultTime?: string | null;
  defaultDurationMinutes?: number;
  timeZone?: string | null;
  rrule?: string | null;
  defaultReminders?: string[];
  reminderChannel?: ReminderChannel;
  isDefault?: boolean;
};

const ANCHORS = new Set([
  "contract_start", "contract_end", "notice_deadline", "signature_date", "custom",
]);

export async function createTemplate(
  userId: string,
  input: CreateTemplateInput,
): Promise<CalendarTemplate> {
  const name = input.name.trim();
  const titleTemplate = input.titleTemplate.trim();
  if (!name || !titleTemplate) {
    throw new AppError(422, "invalid_template", "A template needs a name and a title pattern.");
  }
  const anchor = input.anchor ?? "contract_end";
  if (!ANCHORS.has(anchor)) {
    throw new AppError(422, "invalid_anchor", `Unknown anchor "${anchor}".`);
  }
  const offsetIso = (input.offsetIso ?? "P0D").trim().toUpperCase();
  if (!parseIsoDuration(offsetIso)) {
    throw new AppError(422, "invalid_offset", `"${offsetIso}" is not an ISO-8601 duration.`);
  }
  if (input.kind && !KIND_SET.has(input.kind)) {
    throw new AppError(422, "invalid_kind", `Unknown event kind "${input.kind}".`);
  }
  const reminders = (input.defaultReminders ?? []).map((r) => {
    const iso = r.trim().toUpperCase();
    reminderOffsetSeconds(iso);
    return iso;
  });

  const row = await queryOne<CalendarTemplate>(
    `insert into calendar_event_templates
       (user_id, name, name_en, description, kind, contract_type, title_template,
        title_template_en, anchor, offset_iso, all_day, default_time,
        default_duration_minutes, time_zone, rrule, default_reminders,
        reminder_channel, is_default, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'user')
     returning ${TEMPLATE_COLUMNS}`,
    [
      userId,
      name,
      input.nameEn ?? null,
      input.description ?? null,
      input.kind ?? "deadline",
      input.contractType ?? "",
      titleTemplate,
      input.titleTemplateEn ?? null,
      anchor,
      offsetIso,
      input.allDay ?? true,
      input.defaultTime ?? null,
      input.defaultDurationMinutes ?? 0,
      validateTimeZone(input.timeZone),
      validateRRule(input.rrule ?? null),
      reminders,
      input.reminderChannel ?? "ics_alarm",
      input.isDefault ?? false,
    ],
  );
  if (!row) throw new Error("calendar template insert returned nothing");
  return row;
}

export async function softDeleteTemplate(id: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendar_event_templates set deleted_at = now()
      where id = $1 and user_id = $2 and deleted_at is null
      returning id`,
    [id, userId],
  );
  return row !== null;
}

// ── template application / contract sync ────────────────────────────────────

/**
 * The contract facts a template offsets from. Supplied by the caller because
 * `contracts` has no date columns yet — extraction/analysis is where these
 * values come from today. When those columns land, this shrinks to a join.
 */
export type ContractKeyDates = {
  contractId: string;
  contractName: string;
  contractType?: string;
  /** Vertragsbeginn */
  startsOn?: Date | null;
  /** Vertragsende */
  endsOn?: Date | null;
  /** An explicitly extracted Kündigungsfrist deadline, when the text states one. */
  noticeDeadlineOn?: Date | null;
  signedOn?: Date | null;
  /** Notice period as an ISO duration, e.g. "P3M" — rendered as {{notice_period}}. */
  noticePeriodIso?: string | null;
};

function anchorDate(template: CalendarTemplate, dates: ContractKeyDates): Date | null {
  switch (template.anchor) {
    case "contract_start":
      return dates.startsOn ?? null;
    case "contract_end":
      return dates.endsOn ?? null;
    case "notice_deadline":
      // Prefer an extracted deadline; otherwise derive it from end - notice period.
      if (dates.noticeDeadlineOn) return dates.noticeDeadlineOn;
      if (dates.endsOn && dates.noticePeriodIso) {
        return shiftInstant(dates.endsOn, `-${dates.noticePeriodIso.replace(/^-/, "")}`, template.time_zone);
      }
      return null;
    case "signature_date":
      return dates.signedOn ?? null;
    case "custom":
      return null;
  }
}

function renderTitle(pattern: string, dates: ContractKeyDates): string {
  return pattern
    .replace(/\{\{\s*contract_name\s*\}\}/g, dates.contractName)
    .replace(/\{\{\s*contract_type\s*\}\}/g, dates.contractType ?? "")
    .replace(/\{\{\s*notice_period\s*\}\}/g, dates.noticePeriodIso ?? "")
    .trim();
}

export type DerivedEvent = {
  sourceKey: string;
  templateId: string;
  title: string;
  kind: EventKind;
  allDay: boolean;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  rrule: string | null;
  reminders: string[];
  reminderChannel: ReminderChannel;
};

/**
 * Turn one template + one contract's dates into a concrete event, or null when
 * the anchor date is unknown (an unextracted Vertragsende must not become a
 * deadline on 1970-01-01).
 */
export function applyTemplate(
  template: CalendarTemplate,
  dates: ContractKeyDates,
): DerivedEvent | null {
  const anchor = anchorDate(template, dates);
  if (!anchor) return null;

  const tz = template.time_zone || DEFAULT_TIME_ZONE;
  const shifted = shiftInstant(anchor, template.offset_iso, tz);
  if (!shifted) return null;

  let startsAt = shifted;
  if (template.all_day) {
    const w = toWall(shifted, tz);
    startsAt = fromWall({ ...w, hour: 0, minute: 0, second: 0 }, tz);
  } else if (template.default_time) {
    const [rawH, rawM] = template.default_time.split(":").map(Number);
    const hour = Number.isFinite(rawH) ? rawH : 9;
    const minute = Number.isFinite(rawM) ? rawM : 0;
    const w = toWall(shifted, tz);
    startsAt = fromWall({ ...w, hour, minute, second: 0 }, tz);
  }

  const minutes = template.default_duration_minutes;
  const endsAt =
    minutes > 0
      ? new Date(startsAt.getTime() + minutes * 60_000)
      : defaultEnd(startsAt, template.all_day, tz);

  return {
    sourceKey: `${template.id}:${template.anchor}`,
    templateId: template.id,
    title: renderTitle(template.title_template, dates),
    kind: template.kind,
    allDay: template.all_day,
    startsAt,
    endsAt,
    timeZone: tz,
    rrule: template.rrule,
    reminders: template.default_reminders ?? [],
    reminderChannel: template.reminder_channel,
  };
}

export type SyncResult = {
  created: number;
  updated: number;
  skipped: number; // left alone because the user had edited them
  removed: number;
};

/**
 * Regenerate a contract's derived events from the templates that apply to it.
 *
 * Idempotent: keyed on (contract_id, source_key), so calling it after every
 * change to the contract's dates converges rather than accumulating. Rows the
 * user has touched (`user_modified`) are never overwritten — they are counted
 * as `skipped` so the UI can offer "this contract's dates changed, review it".
 */
export async function syncContractEvents(
  userId: string,
  dates: ContractKeyDates,
  templates?: CalendarTemplate[],
): Promise<SyncResult> {
  const applicable = (templates ?? (await listTemplates(userId, { contractType: dates.contractType })))
    .filter((t) => t.is_default);

  const result: SyncResult = { created: 0, updated: 0, skipped: 0, removed: 0 };
  const wanted: string[] = [];

  for (const template of applicable) {
    const derived = applyTemplate(template, dates);
    if (!derived) continue;
    wanted.push(derived.sourceKey);

    const endAt = seriesEndAt({
      startsAt: derived.startsAt,
      endsAt: derived.endsAt,
      timeZone: derived.timeZone,
      rrule: derived.rrule,
      exdates: [],
    });

    const row = await queryOne<CalendarEvent & { inserted: boolean }>(
      `insert into calendar_events
         (user_id, contract_id, template_id, title, kind, all_day, starts_at,
          ends_at, time_zone, rrule, series_end_at, origin, source_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'derived',$12)
       on conflict (contract_id, source_key)
         where source_key is not null and deleted_at is null
       do update set
         title = excluded.title, kind = excluded.kind, all_day = excluded.all_day,
         starts_at = excluded.starts_at, ends_at = excluded.ends_at,
         time_zone = excluded.time_zone, rrule = excluded.rrule,
         series_end_at = excluded.series_end_at, template_id = excluded.template_id
       where calendar_events.user_modified = false
       returning ${EVENT_COLUMNS}, (xmax = 0) as inserted`,
      [
        userId,
        dates.contractId,
        template.id,
        derived.title,
        derived.kind,
        derived.allDay,
        derived.startsAt,
        derived.endsAt,
        derived.timeZone,
        derived.rrule,
        endAt,
        derived.sourceKey,
      ],
    );

    if (!row) {
      result.skipped++; // the DO UPDATE ... WHERE guard held: user had edited it
      continue;
    }
    if (row.inserted) result.created++;
    else result.updated++;

    for (const offsetIso of derived.reminders) {
      await query(
        `insert into calendar_event_reminders (event_id, offset_iso, offset_seconds, channel)
         values ($1,$2,$3,$4) on conflict do nothing`,
        [row.id, offsetIso, reminderOffsetSeconds(offsetIso), derived.reminderChannel],
      );
    }
  }

  // Derivations that no longer apply (the anchor date disappeared, the template
  // was deleted) are retired — but only the untouched ones.
  const removed = await query<{ id: string }>(
    `update calendar_events set deleted_at = now()
      where contract_id = $1 and user_id = $2 and origin = 'derived'
        and deleted_at is null and user_modified = false
        and not (source_key = any($3::text[]))
      returning id`,
    [dates.contractId, userId, wanted],
  );
  result.removed = removed.length;

  invalidate(userId, dates.contractId);
  return result;
}

// ── feed tokens ─────────────────────────────────────────────────────────────

const FEED_TOKEN_COLUMNS = `id, user_id, token, label, last_used_at, use_count, created_at`;

function newToken(): string {
  // 256 bits. This URL IS the credential, so it must survive being pasted into
  // a calendar app, logged by that app, and never rotated.
  return randomBytes(32).toString("base64url");
}

export async function issueFeedToken(userId: string, label?: string | null): Promise<FeedToken> {
  const row = await queryOne<FeedToken>(
    `insert into calendar_feed_tokens (user_id, token, label)
     values ($1,$2,$3) returning ${FEED_TOKEN_COLUMNS}`,
    [userId, newToken(), label ?? null],
  );
  if (!row) throw new Error("feed token insert returned nothing");
  return row;
}

/** The user's live token, minted on first use. */
export async function currentFeedToken(userId: string): Promise<FeedToken> {
  const existing = await queryOne<FeedToken>(
    `select ${FEED_TOKEN_COLUMNS} from calendar_feed_tokens
      where user_id = $1 and revoked_at is null
      order by created_at desc limit 1`,
    [userId],
  );
  return existing ?? issueFeedToken(userId);
}

/**
 * Revoke every live token and mint a new one. Immediate, with no grace period:
 * the reason to rotate is that the old URL leaked, so keeping it alive would
 * defeat the point. Subscribers must re-add the new URL.
 */
export async function rotateFeedToken(userId: string, label?: string | null): Promise<FeedToken> {
  await query(
    `update calendar_feed_tokens set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return issueFeedToken(userId, label);
}

export async function revokeFeedToken(id: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendar_feed_tokens set revoked_at = now()
      where id = $1 and user_id = $2 and revoked_at is null
      returning id`,
    [id, userId],
  );
  return row !== null;
}

/** Token → Clerk user id. Never cached: a revoked token must die immediately. */
export async function resolveFeedToken(token: string): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const row = await queryOne<{ user_id: string }>(
    `select user_id from calendar_feed_tokens where token = $1 and revoked_at is null`,
    [token],
  );
  return row?.user_id ?? null;
}

/** Fire-and-forget usage stamp. Never blocks the feed response. */
export function touchFeedToken(token: string, userAgent: string | null): void {
  void query(
    `update calendar_feed_tokens
        set last_used_at = now(), use_count = use_count + 1, last_user_agent = $2
      where token = $1`,
    [token, userAgent],
  ).catch((err) => console.error("[calendar] feed token touch failed:", err));
}

/** Absolute subscription URL for a token. */
export function feedUrl(token: string): string {
  const base = (
    process.env.CALENDAR_FEED_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/+$/, "");
  return `${base}/api/calendar/feed/${token}.ics`;
}

// ── .ics feed ───────────────────────────────────────────────────────────────

const UID_DOMAIN = "getlexora.de";

/**
 * Cheap change stamp for the feed's ETag: how many rows the user has and when
 * anything last changed. Both aggregates are covered by
 * calendar_events_user_range_idx, so this is a couple of index reads.
 */
export async function feedFingerprint(
  userId: string,
): Promise<{ events: number; changedAt: string; changedAtMs: number }> {
  const row = await queryOne<{ events: number; events_at: Date | null; reminders_at: Date | null }>(
    `select
       (select count(*)::int from calendar_events
         where user_id = $1 and deleted_at is null) as events,
       (select max(updated_at) from calendar_events
         where user_id = $1 and deleted_at is null) as events_at,
       (select max(r.updated_at) from calendar_event_reminders r
          join calendar_events e on e.id = r.event_id
         where e.user_id = $1 and e.deleted_at is null) as reminders_at`,
    [userId],
  );
  const stamps = [row?.events_at, row?.reminders_at]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());
  const changedAtMs = stamps.length ? Math.max(...stamps) : 0;
  return {
    events: row?.events ?? 0,
    changedAt: changedAtMs ? new Date(changedAtMs).toISOString() : "never",
    changedAtMs,
  };
}

export type FeedValidators = { etag: string; lastModified: string };

function validatorsFor(
  userId: string,
  fp: { events: number; changedAt: string; changedAtMs: number },
): FeedValidators {
  const hash = createHash("sha1")
    .update(`${userId}|${fp.events}|${fp.changedAt}`)
    .digest("hex")
    .slice(0, 24);
  return {
    // Weak: the body is regenerated per request and DTSTAMP moves with it, so
    // two responses are semantically — not byte-for-byte — identical.
    etag: `W/"${hash}"`,
    // HTTP-date has one-second resolution, so it is the weaker validator of the
    // two; we send it for the clients (notably Outlook) that only speak
    // If-Modified-Since.
    lastModified: new Date(fp.changedAtMs || Date.now()).toUTCString(),
  };
}

const GERMAN_ALARM_TEXT: Record<EventKind, string> = {
  deadline: "Frist läuft ab",
  notice: "Kündigungsfrist",
  renewal: "Automatische Verlängerung",
  review: "Vertrag prüfen",
  payment: "Zahlung fällig",
  other: "Erinnerung",
};

/**
 * Serialise the user's calendar.
 *
 * The feed emits SERIES, not occurrences: one VEVENT carrying the RRULE plus an
 * EXDATE list, and one extra VEVENT per override carrying a RECURRENCE-ID. The
 * subscriber's calendar app does the expansion, which is why the feed is O(rows)
 * regardless of how far into the future a yearly deadline runs.
 */
export async function buildFeed(userId: string): Promise<string> {
  const now = Date.now();
  const from = new Date(now - FEED_PAST_DAYS * 86_400_000);
  const to = new Date(now + FEED_FUTURE_DAYS * 86_400_000);

  const rows = await listEventRows(userId, from, to);
  const ids = rows.map((r) => r.id);
  const reminders = ids.length
    ? await query<CalendarReminder>(
        `select ${REMINDER_COLUMNS} from calendar_event_reminders
          where event_id = any($1::uuid[]) and channel = 'ics_alarm'
          order by offset_seconds desc`,
        [ids],
      )
    : [];

  const alarmsByEvent = new Map<string, IcsAlarm[]>();
  for (const r of reminders) {
    const list = alarmsByEvent.get(r.event_id) ?? [];
    list.push({ trigger: r.offset_iso, description: r.label ?? "" });
    alarmsByEvent.set(r.event_id, list);
  }

  const events: IcsEvent[] = rows.map((row) => {
    const alarms = (alarmsByEvent.get(row.id) ?? []).map((a) => ({
      trigger: a.trigger,
      description: a.description || `${GERMAN_ALARM_TEXT[row.kind]}: ${row.title}`,
    }));
    return {
      // Stable for the life of the row: a changed UID would make every
      // subscriber's calendar duplicate the event instead of updating it.
      uid: `${row.recurrence_parent_id ?? row.id}@${UID_DOMAIN}`,
      summary: row.title,
      description: row.description,
      location: row.location,
      allDay: row.all_day,
      start: row.starts_at,
      end: row.ends_at,
      timeZone: row.time_zone,
      rrule: row.rrule,
      exdates: row.exdates ?? [],
      recurrenceId: row.recurrence_id,
      categories: [row.kind],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // updated_at as a coarse SEQUENCE: monotonic per row, which is all RFC
      // 5545 asks for, without another column to maintain.
      sequence: Math.floor(row.updated_at.getTime() / 1000) % 2_147_483_647,
      alarms,
    };
  });

  return buildCalendar({
    name: "Lexora — Vertragsfristen",
    description: "Fristen, Kündigungstermine und Prüftermine aus Ihren Verträgen.",
    timeZone: DEFAULT_TIME_ZONE,
    events,
    refreshMinutes: FEED_REFRESH_MINUTES,
  });
}

// ── reminder worker interface (the worker itself is not built) ──────────────

export type DueReminder = {
  reminderId: string;
  eventId: string;
  userId: string;
  contractId: string | null;
  title: string;
  kind: EventKind;
  timeZone: string;
  allDay: boolean;
  offsetIso: string;
  label: string | null;
  occurrenceStart: Date;
  fireAt: Date;
};

/** Longest lead time we will scan back for. Matches reminderOffsetSeconds' cap. */
const MAX_LEAD_SECONDS = 370 * 86_400;

/**
 * Email reminders whose fire time has passed but which have not been dispatched.
 *
 * Two stages, because a reminder stores an OFFSET and not a date: the SQL
 * narrows to series that could plausibly have an occurrence in the window (one
 * index range scan), then each (reminder, occurrence) pair is expanded exactly
 * in JS. `graceSeconds` bounds how late a reminder may still be sent after a
 * worker outage — beyond that the deadline has usually passed and a late email
 * is noise.
 */
export async function dueReminders(
  now: Date,
  graceSeconds = 6 * 3_600,
): Promise<DueReminder[]> {
  const windowStart = new Date(now.getTime() - (graceSeconds + MAX_LEAD_SECONDS) * 1000);
  const windowEnd = new Date(now.getTime() + MAX_LEAD_SECONDS * 1000);

  const rows = await query<
    CalendarEvent & {
      reminder_id: string;
      offset_iso: string;
      offset_seconds: number;
      reminder_label: string | null;
    }
  >(
    `select ${EVENT_COLUMNS_E},
            r.id as reminder_id, r.offset_iso, r.offset_seconds,
            r.label as reminder_label
       from calendar_event_reminders r
       join calendar_events e on e.id = r.event_id
      where r.channel = 'email'
        and e.deleted_at is null
        and e.starts_at < $2
        and (e.series_end_at is null or e.series_end_at > $1)`,
    [windowStart, windowEnd],
  );

  const due: DueReminder[] = [];
  for (const row of rows) {
    // fire_at = occurrence.start + offset, so the occurrences that can fire now
    // start in (now - grace - offset, now - offset].
    const offsetMs = row.offset_seconds * 1000;
    const rangeStart = new Date(now.getTime() - graceSeconds * 1000 - offsetMs);
    const rangeEnd = new Date(now.getTime() - offsetMs + 1000);

    for (const occ of expandOccurrences(toSeries(row), rangeStart, rangeEnd)) {
      const fireAt = new Date(occ.start.getTime() + offsetMs);
      if (fireAt > now || fireAt < new Date(now.getTime() - graceSeconds * 1000)) continue;
      due.push({
        reminderId: row.reminder_id,
        eventId: row.id,
        userId: row.user_id,
        contractId: row.contract_id,
        title: row.title,
        kind: row.kind,
        timeZone: row.time_zone,
        allDay: row.all_day,
        offsetIso: row.offset_iso,
        label: row.reminder_label,
        occurrenceStart: occ.start,
        fireAt,
      });
    }
  }
  return due;
}

/**
 * Claim a reminder for delivery. Returns the dispatch id when THIS caller won,
 * null when it was already claimed — winning the insert is the lock, so two
 * workers racing the same occurrence can never both send.
 */
export async function claimReminderDispatch(due: DueReminder): Promise<number | null> {
  const row = await queryOne<{ id: string }>(
    `insert into reminder_dispatches (reminder_id, event_id, occurrence_start, fire_at)
     values ($1,$2,$3,$4)
     on conflict (reminder_id, occurrence_start) do nothing
     returning id`,
    [due.reminderId, due.eventId, due.occurrenceStart, due.fireAt],
  );
  return row ? Number(row.id) : null;
}

/** Close out a claimed dispatch. `error` moves it to 'failed' for a retry sweep. */
export async function markReminderDispatched(
  dispatchId: number,
  error?: string | null,
): Promise<void> {
  await query(
    `update reminder_dispatches
        set status = $2, attempts = attempts + 1,
            error = $3, sent_at = case when $2 = 'sent' then now() else sent_at end
      where id = $1`,
    [dispatchId, error ? "failed" : "sent", error ?? null],
  );
}

// ── caching ─────────────────────────────────────────────────────────────────
//
// Two layers, because they fail differently:
//   1. Next's data cache (unstable_cache + revalidateTag) — survives across
//      requests and instances, invalidated explicitly on every write.
//   2. A tiny in-process map — absorbs the burst of identical expansions a
//      single page render makes, and expires on its own.
//
// NOTE: unstable_cache round-trips values through the data cache's serialiser,
// so a cached function must return a JSON-safe shape. That is why the cached
// entry points return ISO strings (SerialisedOccurrence) and the raw pg rows,
// which carry Date objects, are never cached.
//
// Next 16 deprecates unstable_cache in favour of the `use cache` directive, but
// that needs `cacheComponents: true` in next.config.ts, which this app has not
// opted into. Swapping is mechanical when it does.

type CacheEntry = { at: number; value: SerialisedOccurrence[] };
const OCCURRENCE_TTL_MS = 60_000;
const OCCURRENCE_CACHE_MAX = 200;

const globalForCalendar = globalThis as unknown as {
  calendarOccurrences?: Map<string, CacheEntry>;
};
const occurrenceCache = (globalForCalendar.calendarOccurrences ??= new Map());

function occurrenceKey(userId: string, from: Date, to: Date): string {
  return `${userId}|${from.toISOString()}|${to.toISOString()}`;
}

function occurrenceCacheGet(userId: string, from: Date, to: Date): SerialisedOccurrence[] | null {
  const hit = occurrenceCache.get(occurrenceKey(userId, from, to));
  if (!hit) return null;
  if (Date.now() - hit.at > OCCURRENCE_TTL_MS) return null;
  return hit.value;
}

function occurrenceCacheSet(
  userId: string,
  from: Date,
  to: Date,
  value: SerialisedOccurrence[],
): void {
  if (occurrenceCache.size >= OCCURRENCE_CACHE_MAX) {
    // Cheap FIFO eviction: Map preserves insertion order.
    const oldest = occurrenceCache.keys().next().value;
    if (oldest !== undefined) occurrenceCache.delete(oldest);
  }
  occurrenceCache.set(occurrenceKey(userId, from, to), { at: Date.now(), value });
}

/** Occurrences in [from, to), through the Next data cache. Tag: calendar:<userId>. */
export function listOccurrencesCached(
  userId: string,
  from: Date,
  to: Date,
): Promise<SerialisedOccurrence[]> {
  return unstable_cache(
    (u: string, f: string, t: string) => listOccurrences(u, new Date(f), new Date(t)),
    ["calendar", "occurrences"],
    { tags: [calendarTag(userId)], revalidate: 300 },
  )(userId, from.toISOString(), to.toISOString());
}

/**
 * The serialised feed plus its ETag. Cached under its own tag so a subscriber
 * polling every few hours costs one hash comparison, not a re-serialisation —
 * and so an in-app edit invalidates the feed and the list view together.
 */
export function buildFeedCached(
  userId: string,
): Promise<{ ics: string } & FeedValidators> {
  return unstable_cache(
    async (u: string) => {
      const [ics, fp] = await Promise.all([buildFeed(u), feedFingerprint(u)]);
      return { ics, ...validatorsFor(u, fp) };
    },
    ["calendar", "feed"],
    { tags: [calendarFeedTag(userId)], revalidate: 900 },
  )(userId);
}

/**
 * Validators alone, for answering a conditional GET without building the body.
 * Deliberately UNCACHED: it is two index reads, and it is the thing that has to
 * be right the moment after a write.
 */
export async function feedValidators(userId: string): Promise<FeedValidators> {
  return validatorsFor(userId, await feedFingerprint(userId));
}
