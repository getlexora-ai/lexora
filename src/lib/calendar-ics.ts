// Hand-rolled RFC 5545 (iCalendar) serialisation for the read-only
// subscription feed. Pure — no imports beyond the local wall-clock helpers — so
// it is unit-testable without Next / Clerk / pg, and so a malformed feed can
// never be blamed on a third-party dependency we do not control.
//
// Deliberately small: we only ever WRITE iCalendar (VCALENDAR / VEVENT /
// VALARM / VTIMEZONE), never parse it, so a full library would be ~40x the code
// for features we do not use.

// Relative, not "@/lib/…": that alias is a bundler/tsconfig feature, and this
// module must stay loadable by plain `node --test` (same reason as
// src/lib/rag/db.ts).
import { toWall, type Wall } from "./calendar-rrule.ts";

const CRLF = "\r\n";

/** Product identifier, per RFC 5545 §3.7.3. */
const PRODID = "-//Lexora//Contract Calendar//DE";

// ── value encoding ──────────────────────────────────────────────────────────

/** Escape a TEXT value: backslash, semicolon, comma, newline (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line to 75 OCTETS (not characters) with a leading-space
 * continuation, per RFC 5545 §3.1. Folding by character would overflow the
 * limit on German umlauts and break strict parsers.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  let limit = 75;

  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (chunkBytes + size > limit) {
      out.push(chunk);
      chunk = "";
      chunkBytes = 0;
      limit = 74; // continuation lines carry a leading space
    }
    chunk += ch;
    chunkBytes += size;
  }
  if (chunk) out.push(chunk);
  return out.join(`${CRLF} `);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function wallStamp(w: Wall, dateOnly: boolean): string {
  const date = `${pad(w.year, 4)}${pad(w.month)}${pad(w.day)}`;
  return dateOnly ? date : `${date}T${pad(w.hour)}${pad(w.minute)}${pad(w.second)}`;
}

/** UTC form: 20260331T090000Z. Used for DTSTAMP / LAST-MODIFIED / EXDATE. */
export function icsUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** Local date in `timeZone`: 20260331. Used for all-day DTSTART / DTEND. */
export function icsDate(date: Date, timeZone: string): string {
  return wallStamp(toWall(date, timeZone), true);
}

/** Local date-time in `timeZone`: 20260331T090000. Paired with a TZID param. */
export function icsLocal(date: Date, timeZone: string): string {
  return wallStamp(toWall(date, timeZone), false);
}

// ── VTIMEZONE ───────────────────────────────────────────────────────────────

/**
 * A TZID reference is only valid when the calendar carries a matching
 * VTIMEZONE (RFC 5545 §3.6.5). Google and Apple tolerate a bare IANA TZID;
 * Outlook and strict validators do not, so we emit the block.
 *
 * Europe/Berlin has followed the EU rule since 1996 (forward on the last Sunday
 * in March at 02:00 local, back on the last Sunday in October at 03:00), so a
 * static definition is correct for every date this product cares about. If the
 * EU ever abolishes the switch, this block and only this block changes.
 */
const BERLIN_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "X-LIC-LOCATION:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// ── events ──────────────────────────────────────────────────────────────────

export type IcsAlarm = {
  /** RFC 5545 TRIGGER duration relative to the start: "-P7D", "-PT1H". */
  trigger: string;
  description: string;
};

export type IcsEvent = {
  /** Globally unique and STABLE across regenerations (RFC 5545 §3.8.4.7). */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  allDay: boolean;
  start: Date;
  /** Exclusive, like DTEND. */
  end: Date;
  timeZone: string;
  /** RRULE body without the prefix. */
  rrule?: string | null;
  exdates?: Date[];
  /** Set on an override VEVENT: the original start it replaces. */
  recurrenceId?: Date | null;
  categories?: string[];
  url?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  /** Bumped on every material edit so clients re-read rather than merge. */
  sequence?: number;
  cancelled?: boolean;
  alarms?: IcsAlarm[];
};

export type IcsCalendar = {
  name: string;
  description?: string;
  /** Zone advertised to the client; also the zone all-day dates are read in. */
  timeZone: string;
  events: IcsEvent[];
  /** Hint for how often a subscriber should re-poll. */
  refreshMinutes?: number;
};

function dateProperty(
  name: string,
  date: Date,
  allDay: boolean,
  timeZone: string,
): string {
  if (allDay) return `${name};VALUE=DATE:${icsDate(date, timeZone)}`;
  if (timeZone === "Europe/Berlin") {
    return `${name};TZID=Europe/Berlin:${icsLocal(date, timeZone)}`;
  }
  // Any other zone would need its own VTIMEZONE; UTC is always safe.
  return `${name}:${icsUtc(date)}`;
}

function eventLines(event: IcsEvent, stamp: Date): string[] {
  const tz = event.timeZone || "Europe/Berlin";
  const lines: string[] = ["BEGIN:VEVENT"];

  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${icsUtc(stamp)}`);
  lines.push(dateProperty("DTSTART", event.start, event.allDay, tz));
  lines.push(dateProperty("DTEND", event.end, event.allDay, tz));
  lines.push(`SUMMARY:${escapeText(event.summary)}`);

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.categories?.length) {
    lines.push(`CATEGORIES:${event.categories.map(escapeText).join(",")}`);
  }
  if (event.rrule) lines.push(`RRULE:${event.rrule}`);
  if (event.exdates?.length) {
    // EXDATE must match DTSTART's value type. All-day series exclude whole days.
    const value = event.allDay
      ? `EXDATE;VALUE=DATE:${event.exdates.map((d) => icsDate(d, tz)).join(",")}`
      : `EXDATE;TZID=${tz}:${event.exdates.map((d) => icsLocal(d, tz)).join(",")}`;
    lines.push(value);
  }
  if (event.recurrenceId) {
    lines.push(dateProperty("RECURRENCE-ID", event.recurrenceId, event.allDay, tz));
  }
  if (event.createdAt) lines.push(`CREATED:${icsUtc(event.createdAt)}`);
  if (event.updatedAt) lines.push(`LAST-MODIFIED:${icsUtc(event.updatedAt)}`);
  lines.push(`SEQUENCE:${event.sequence ?? 0}`);
  lines.push(`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  // A deadline is something you must know about, not something that occupies
  // the day — never let it mark the user busy in free/busy lookups.
  lines.push("TRANSP:TRANSPARENT");

  for (const alarm of event.alarms ?? []) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${alarm.trigger}`,
      `DESCRIPTION:${escapeText(alarm.description)}`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

/** Serialise a whole VCALENDAR. Returns CRLF-delimited, folded iCalendar text. */
export function buildCalendar(cal: IcsCalendar): string {
  const stamp = new Date();
  const needsBerlin =
    cal.timeZone === "Europe/Berlin" ||
    cal.events.some((e) => !e.allDay && (e.timeZone || "Europe/Berlin") === "Europe/Berlin");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    // PUBLISH: a one-way feed, not an invitation exchange.
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    `X-WR-TIMEZONE:${cal.timeZone}`,
  ];
  if (cal.description) lines.push(`X-WR-CALDESC:${escapeText(cal.description)}`);
  if (cal.refreshMinutes) {
    // REFRESH-INTERVAL is the standard property (RFC 7986); X-PUBLISHED-TTL is
    // what Outlook actually reads. Emit both.
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${cal.refreshMinutes}M`);
    lines.push(`X-PUBLISHED-TTL:PT${cal.refreshMinutes}M`);
  }
  if (needsBerlin) lines.push(...BERLIN_VTIMEZONE);

  for (const event of cal.events) lines.push(...eventLines(event, stamp));
  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join(CRLF) + CRLF;
}
