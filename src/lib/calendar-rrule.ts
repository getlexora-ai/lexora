// Pure RFC 5545 recurrence maths — no imports, so it can be unit-tested
// directly (tests/*.test.mjs) without pulling in Next / Clerk / pg.
//
// Why no `rrule` npm package (see docs/calendar/design.md):
//   * rrule.js expands in a "floating" pseudo-UTC and leaves IANA-zone handling
//     to the caller (or to a luxon peer dep). Lexora's whole recurrence problem
//     IS the zone — a Kündigungsfrist deadline on the 3rd must stay on the 3rd
//     across the Europe/Berlin DST switch — so we would be writing the hard
//     half ourselves anyway.
//   * Calendar clients expand the RRULE themselves from the .ics feed. Our
//     expansion only serves the in-app list and the reminder scan, over a
//     bounded window, for a handful of deadline-shaped series per user.
//   * The supported subset below is everything a contract deadline needs, in
//     ~350 lines with zero supply-chain surface.
//
// Anything outside the subset is REJECTED at write time rather than silently
// mis-expanded — see parseRRule().

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** One BYDAY entry: "3TU" => {ordinal: 3, weekday: "TU"}, "MO" => ordinal null. */
export type ByDay = { ordinal: number | null; weekday: Weekday };

export type RRule = {
  freq: Freq;
  interval: number;
  count: number | null;
  /** Inclusive upper bound on an occurrence START, as an absolute instant. */
  until: Date | null;
  byDay: ByDay[];
  /** 1..31, or negative from the end of the month (-1 = last day). */
  byMonthDay: number[];
  /** 1..12 */
  byMonth: number[];
};

/** A single expanded occurrence of a series. */
export type Occurrence = {
  start: Date;
  /** Exclusive, like RFC 5545 DTEND. */
  end: Date;
  /**
   * The start this occurrence WOULD have had from the rule alone — the RFC 5545
   * RECURRENCE-ID. Stays stable when an override moves the occurrence, so it is
   * the key for EXDATE, overrides and reminder dispatch bookkeeping.
   */
  recurrenceId: Date;
};

export type Series = {
  startsAt: Date;
  /** Exclusive. */
  endsAt: Date;
  timeZone: string;
  /** RRULE body without the "RRULE:" prefix. Null => a one-off event. */
  rrule: string | null;
  exdates: Date[];
};

/** Thrown by parseRRule; callers turn it into a 422. */
export class RRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RRuleError";
  }
}

// Runaway guards. A deadline calendar never legitimately approaches these; they
// exist so a hostile or fat-fingered rule cannot pin a request.
const MAX_ITERATIONS = 20_000;
const MAX_OCCURRENCES = 3_000;

// ── wall-clock helpers ──────────────────────────────────────────────────────
// A Wall is a civil date-time with NO zone attached. All recurrence arithmetic
// happens on Wall values in the event's time_zone, which is what keeps "the 3rd
// of every month at 09:00" on the 3rd at 09:00 across a DST transition.

export type Wall = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The civil date-time an instant reads as in `timeZone`. */
export function toWall(date: Date, timeZone: string): Wall {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Civil epoch of a Wall: the instant it would be if the zone were UTC. */
function wallEpoch(w: Wall): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

function epochWall(ms: number): Wall {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/** Zone offset in ms at a given instant. */
function offsetAt(ms: number, timeZone: string): number {
  return wallEpoch(toWall(new Date(ms), timeZone)) - ms;
}

/**
 * The instant at which `timeZone` reads as this wall-clock time.
 *
 * Two passes: guess with the offset at the naive instant, then correct with the
 * offset actually in force there. That is exact everywhere except inside a DST
 * transition, where the wall time is either ambiguous (repeated hour, we pick
 * the first) or non-existent (skipped hour, we land just after the jump). Both
 * are acceptable for deadlines, which are all-day or business-hours.
 */
export function fromWall(w: Wall, timeZone: string): Date {
  const naive = wallEpoch(w);
  const first = naive - offsetAt(naive, timeZone);
  return new Date(naive - offsetAt(first, timeZone));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday, matching WEEKDAYS. */
function weekdayIndex(w: Wall): number {
  const dow = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay(); // 0 = Sun
  return (dow + 6) % 7;
}

function addDays(w: Wall, n: number): Wall {
  return epochWall(wallEpoch(w) + n * 86_400_000);
}

function withDay(w: Wall, year: number, month: number, day: number): Wall {
  return { ...w, year, month, day };
}

// ── RRULE parsing ───────────────────────────────────────────────────────────

const FREQS = new Set<string>(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const WEEKDAY_SET = new Set<string>(WEEKDAYS);

/**
 * Parse an RRULE body (no "RRULE:" prefix). Supported: FREQ, INTERVAL, COUNT,
 * UNTIL, BYDAY, BYMONTHDAY, BYMONTH, WKST (accepted, ignored — every supported
 * frequency is WKST-independent here).
 *
 * Unsupported parts (BYSETPOS, BYYEARDAY, BYWEEKNO, BYHOUR/BYMINUTE/BYSECOND,
 * FREQ=HOURLY and below) throw rather than being dropped: a deadline that
 * silently expands to the wrong dates is worse than a rejected form.
 */
export function parseRRule(body: string): RRule {
  const rule: RRule = {
    freq: "DAILY",
    interval: 1,
    count: null,
    until: null,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
  };
  let sawFreq = false;

  for (const part of body.trim().split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) throw new RRuleError(`Malformed RRULE part "${part}".`);
    const name = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();

    switch (name) {
      case "FREQ": {
        const v = value.toUpperCase();
        if (!FREQS.has(v)) {
          throw new RRuleError(
            `FREQ=${value} is not supported. Use DAILY, WEEKLY, MONTHLY or YEARLY.`,
          );
        }
        rule.freq = v as Freq;
        sawFreq = true;
        break;
      }
      case "INTERVAL": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          throw new RRuleError(`INTERVAL must be an integer between 1 and 1000.`);
        }
        rule.interval = n;
        break;
      }
      case "COUNT": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > MAX_OCCURRENCES) {
          throw new RRuleError(`COUNT must be between 1 and ${MAX_OCCURRENCES}.`);
        }
        rule.count = n;
        break;
      }
      case "UNTIL": {
        const d = parseIcsDate(value);
        if (!d) throw new RRuleError(`UNTIL="${value}" is not a valid date-time.`);
        rule.until = d;
        break;
      }
      case "BYDAY": {
        for (const raw of value.split(",")) {
          const m = /^([+-]?\d{1,2})?([A-Za-z]{2})$/.exec(raw.trim());
          const wd = m?.[2]?.toUpperCase();
          if (!m || !wd || !WEEKDAY_SET.has(wd)) {
            throw new RRuleError(`BYDAY="${raw}" is not a valid weekday.`);
          }
          const ord = m[1] ? Number(m[1]) : null;
          if (ord !== null && (ord === 0 || ord < -5 || ord > 5)) {
            throw new RRuleError(`BYDAY ordinal in "${raw}" must be -5..-1 or 1..5.`);
          }
          rule.byDay.push({ ordinal: ord, weekday: wd as Weekday });
        }
        break;
      }
      case "BYMONTHDAY": {
        for (const raw of value.split(",")) {
          const n = Number(raw.trim());
          if (!Number.isInteger(n) || n === 0 || n < -31 || n > 31) {
            throw new RRuleError(`BYMONTHDAY="${raw}" must be -31..-1 or 1..31.`);
          }
          rule.byMonthDay.push(n);
        }
        break;
      }
      case "BYMONTH": {
        for (const raw of value.split(",")) {
          const n = Number(raw.trim());
          if (!Number.isInteger(n) || n < 1 || n > 12) {
            throw new RRuleError(`BYMONTH="${raw}" must be 1..12.`);
          }
          rule.byMonth.push(n);
        }
        break;
      }
      case "WKST":
        break; // accepted, irrelevant to the supported frequencies
      default:
        throw new RRuleError(`RRULE part "${name}" is not supported.`);
    }
  }

  if (!sawFreq) throw new RRuleError("RRULE must contain FREQ.");
  if (rule.count !== null && rule.until !== null) {
    throw new RRuleError("RRULE must not set both COUNT and UNTIL.");
  }
  if (rule.freq === "DAILY" && rule.byDay.some((d) => d.ordinal !== null)) {
    throw new RRuleError("BYDAY ordinals are not allowed with FREQ=DAILY.");
  }
  if (rule.freq === "WEEKLY" && rule.byDay.some((d) => d.ordinal !== null)) {
    throw new RRuleError("BYDAY ordinals are not allowed with FREQ=WEEKLY.");
  }
  return rule;
}

/** Serialise a rule back to an RRULE body. Part order follows RFC 5545 §3.3.10. */
export function stringifyRRule(rule: RRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`);
  if (rule.byMonth.length) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  if (rule.byMonthDay.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byDay.length) {
    parts.push(`BYDAY=${rule.byDay.map((d) => `${d.ordinal ?? ""}${d.weekday}`).join(",")}`);
  }
  return parts.join(";");
}

/**
 * Re-bound a rule for a "this and future" split: cap the original series just
 * before `until`, converting a COUNT into the number of occurrences that
 * actually fall before the split so the two halves still total the original.
 */
export function boundRRule(
  body: string,
  series: Series,
  until: Date,
): { before: string; after: string } {
  const rule = parseRRule(body);

  if (rule.count === null) {
    const before = stringifyRRule({ ...rule, until: new Date(until.getTime() - 1000) });
    return { before, after: stringifyRRule(rule) };
  }

  const all = expandOccurrences(
    { ...series, exdates: [] },
    series.startsAt,
    new Date(until.getTime() + 1),
  );
  const kept = all.filter((o) => o.start < until).length;
  return {
    before: stringifyRRule({ ...rule, count: Math.max(1, kept) }),
    after: stringifyRRule({ ...rule, count: Math.max(1, rule.count - kept) }),
  };
}

/** Returns null when the rule is valid, otherwise the reason. */
export function rruleError(body: string): string | null {
  try {
    parseRRule(body);
    return null;
  } catch (err) {
    return err instanceof RRuleError ? err.message : "Invalid recurrence rule.";
  }
}

/** Parse an iCalendar date ("20260331") or date-time ("20260331T090000Z"). */
export function parseIcsDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  return Number.isNaN(ms) ? null : new Date(ms);
}

// ── expansion ───────────────────────────────────────────────────────────────

/** Candidate wall-clock days produced by one MONTHLY/YEARLY period. */
function monthDays(rule: RRule, anchor: Wall, year: number, month: number): Wall[] {
  const dim = daysInMonth(year, month);
  const out: number[] = [];

  if (rule.byMonthDay.length > 0) {
    for (const md of rule.byMonthDay) {
      const day = md > 0 ? md : dim + md + 1;
      if (day >= 1 && day <= dim) out.push(day);
    }
  } else if (rule.byDay.length > 0) {
    for (const bd of rule.byDay) {
      const target = WEEKDAYS.indexOf(bd.weekday);
      const matches: number[] = [];
      for (let day = 1; day <= dim; day++) {
        if (weekdayIndex(withDay(anchor, year, month, day)) === target) matches.push(day);
      }
      if (bd.ordinal === null) {
        out.push(...matches);
      } else {
        const idx = bd.ordinal > 0 ? bd.ordinal - 1 : matches.length + bd.ordinal;
        const day = matches[idx];
        if (day !== undefined) out.push(day);
      }
    }
  } else {
    // No BY* part: keep DTSTART's day-of-month. RFC 5545 SKIPS months that are
    // too short (31 Jan monthly => no 31 Feb), it does not clamp.
    if (anchor.day <= dim) out.push(anchor.day);
  }

  return [...new Set(out)]
    .sort((a, b) => a - b)
    .map((day) => withDay(anchor, year, month, day));
}

/**
 * Expand a series into the occurrences overlapping [rangeStart, rangeEnd).
 *
 * Occurrences are generated forward from DTSTART because COUNT is defined from
 * DTSTART; when the rule has no COUNT we fast-forward the period index to just
 * before rangeStart so a ten-year-old daily series costs the same as a fresh one.
 */
export function expandOccurrences(
  series: Series,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const tz = series.timeZone || "Europe/Berlin";
  const startWall = toWall(series.startsAt, tz);
  // Duration as a CIVIL delta, not milliseconds: an all-day event that spans a
  // DST switch must still end at midnight, not 23:00.
  const durationMs = wallEpoch(toWall(series.endsAt, tz)) - wallEpoch(startWall);
  const excluded = new Set(series.exdates.map((d) => d.getTime()));

  const emit = (wall: Wall): Occurrence => {
    const start = fromWall(wall, tz);
    return {
      start,
      end: fromWall(epochWall(wallEpoch(wall) + durationMs), tz),
      recurrenceId: start,
    };
  };

  const keep = (occ: Occurrence): boolean =>
    !excluded.has(occ.recurrenceId.getTime()) &&
    occ.start < rangeEnd &&
    occ.end > rangeStart;

  if (!series.rrule) {
    const occ = emit(startWall);
    return keep(occ) ? [occ] : [];
  }

  const rule = parseRRule(series.rrule);
  const out: Occurrence[] = [];
  let emitted = 0;
  let iterations = 0;

  // Fast-forward: safe only without COUNT, which must be counted from DTSTART.
  let period = 0;
  if (rule.count === null && rangeStart > series.startsAt) {
    const fromWallStart = toWall(rangeStart, tz);
    const days = Math.floor((wallEpoch(fromWallStart) - wallEpoch(startWall)) / 86_400_000);
    const months =
      (fromWallStart.year - startWall.year) * 12 + (fromWallStart.month - startWall.month);
    if (rule.freq === "DAILY") period = Math.max(0, Math.floor(days / rule.interval) - 1);
    else if (rule.freq === "WEEKLY") period = Math.max(0, Math.floor(days / (7 * rule.interval)) - 1);
    else if (rule.freq === "MONTHLY") period = Math.max(0, Math.floor(months / rule.interval) - 1);
    else period = Math.max(0, Math.floor(months / 12 / rule.interval) - 1);
  }

  outer: for (; iterations < MAX_ITERATIONS; period++) {
    // Count the period itself, so an unsatisfiable rule (MONTHLY;INTERVAL=12
    // starting in February with BYMONTH=1) still terminates.
    iterations++;
    const candidates: Wall[] = [];

    switch (rule.freq) {
      case "DAILY":
        candidates.push(addDays(startWall, period * rule.interval));
        break;
      case "WEEKLY": {
        // Start of the ISO week containing DTSTART, advanced by whole intervals.
        const weekStart = addDays(startWall, -weekdayIndex(startWall) + period * 7 * rule.interval);
        const days =
          rule.byDay.length > 0
            ? rule.byDay.map((d) => WEEKDAYS.indexOf(d.weekday))
            : [weekdayIndex(startWall)];
        for (const d of [...new Set(days)].sort((a, b) => a - b)) {
          candidates.push(addDays(weekStart, d));
        }
        break;
      }
      case "MONTHLY": {
        const total = startWall.month - 1 + period * rule.interval;
        const year = startWall.year + Math.floor(total / 12);
        const month = (total % 12) + 1;
        if (rule.byMonth.length > 0 && !rule.byMonth.includes(month)) continue;
        candidates.push(...monthDays(rule, startWall, year, month));
        break;
      }
      case "YEARLY": {
        const year = startWall.year + period * rule.interval;
        const months = rule.byMonth.length > 0 ? rule.byMonth : [startWall.month];
        for (const month of months) candidates.push(...monthDays(rule, startWall, year, month));
        break;
      }
    }

    // A period that yields nothing (short month, BYMONTH miss) is normal;
    // MAX_ITERATIONS is what stops an unsatisfiable rule.
    if (candidates.length === 0) continue;

    for (const wall of candidates) {
      iterations++;
      if (iterations > MAX_ITERATIONS) break outer;

      const occ = emit(wall);
      // Candidates before DTSTART (the leading partial week/month) are not
      // occurrences and must not consume COUNT.
      if (occ.start < series.startsAt) continue;
      if (rule.until && occ.start > rule.until) break outer;

      emitted++;
      if (keep(occ)) out.push(occ);
      if (rule.count !== null && emitted >= rule.count) break outer;
      if (occ.start >= rangeEnd) break outer;
      if (out.length >= MAX_OCCURRENCES) break outer;
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/**
 * End of the last possible occurrence, for the denormalised
 * calendar_events.series_end_at pruning column. Null => the series never ends.
 *
 * With UNTIL this is deliberately generous (UNTIL + duration rather than the
 * true last occurrence): series_end_at is only ever used to EXCLUDE rows from a
 * range scan, so erring late can cost a wasted expansion but never a miss.
 */
export function seriesEndAt(series: Series): Date | null {
  if (!series.rrule) return series.endsAt;
  const rule = parseRRule(series.rrule);

  if (rule.until) {
    const tz = series.timeZone || "Europe/Berlin";
    const durationMs = wallEpoch(toWall(series.endsAt, tz)) - wallEpoch(toWall(series.startsAt, tz));
    return new Date(rule.until.getTime() + durationMs);
  }

  if (rule.count !== null) {
    // Bounded: COUNT is capped at MAX_OCCURRENCES by parseRRule.
    const far = new Date(series.startsAt.getTime() + 200 * 365 * 86_400_000);
    const all = expandOccurrences({ ...series, exdates: [] }, series.startsAt, far);
    const last = all[all.length - 1];
    return last ? last.end : series.endsAt;
  }

  return null; // open-ended
}

// ── ISO-8601 durations (reminder offsets, template offsets) ─────────────────

export type IsoDuration = {
  sign: 1 | -1;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const DURATION_RE =
  /^([+-])?P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?!$)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Parse a signed ISO-8601 duration ("-P3M", "-P7D", "-PT1H"). Null if invalid. */
export function parseIsoDuration(value: string): IsoDuration | null {
  const m = DURATION_RE.exec(value.trim().toUpperCase());
  if (!m) return null;
  const n = (i: number) => (m[i] ? Number(m[i]) : 0);
  return {
    sign: m[1] === "-" ? -1 : 1,
    years: n(2),
    months: n(3),
    weeks: n(4),
    days: n(5),
    hours: n(6),
    minutes: n(7),
    seconds: n(8),
  };
}

/**
 * Exact length of a duration in seconds (signed), or null when it contains
 * years or months — those are calendar arithmetic and have no fixed length.
 * Reminder offsets must be exact, which is why they are restricted to W/D/H/M/S.
 */
export function isoDurationSeconds(value: string): number | null {
  const d = parseIsoDuration(value);
  if (!d) return null;
  if (d.years > 0 || d.months > 0) return null;
  const secs =
    d.weeks * 604_800 + d.days * 86_400 + d.hours * 3_600 + d.minutes * 60 + d.seconds;
  return d.sign * secs;
}

/**
 * Shift an instant by an ISO duration, in `timeZone` wall-clock terms.
 *
 * Years and months are calendar arithmetic and CLAMP to the end of the target
 * month (30 Nov minus P3M is 31 Aug; 31 May minus P3M is 28/29 Feb) — the same
 * rule Postgres `interval` uses, and the one German notice periods assume.
 * Note this differs from recurrence expansion, which SKIPS short months per RFC.
 */
export function shiftInstant(date: Date, iso: string, timeZone: string): Date | null {
  const d = parseIsoDuration(iso);
  if (!d) return null;
  const s = d.sign;
  const w = toWall(date, timeZone);

  const totalMonths = w.month - 1 + s * (d.years * 12 + d.months);
  const year = w.year + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(w.day, daysInMonth(year, month));

  const shifted = addDays({ ...w, year, month, day }, s * (d.weeks * 7 + d.days));
  const withTime = wallEpoch(shifted) + s * (d.hours * 3_600 + d.minutes * 60 + d.seconds) * 1000;
  return fromWall(epochWall(withTime), timeZone);
}
