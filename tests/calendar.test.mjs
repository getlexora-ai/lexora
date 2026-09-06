// Calendar — pure unit tests for the recurrence maths and the iCalendar writer.
//   node --test 'tests/**/*.test.mjs'
// No DB, no Next, no network: src/lib/calendar-rrule.ts and calendar-ics.ts are
// import-free by design so they can be tested exactly like rate-limit-core.
import test from "node:test";
import assert from "node:assert/strict";
import {
  boundRRule,
  expandOccurrences,
  fromWall,
  isoDurationSeconds,
  parseRRule,
  rruleError,
  seriesEndAt,
  shiftInstant,
  stringifyRRule,
  toWall,
} from "../src/lib/calendar-rrule.ts";
import { buildCalendar, escapeText, foldLine } from "../src/lib/calendar-ics.ts";

const TZ = "Europe/Berlin";

/** An all-day series starting on the given Berlin date. */
function allDay(dateIso, rrule = null, exdates = []) {
  const startsAt = fromWall(wallOf(dateIso), TZ);
  const endsAt = fromWall({ ...wallOf(dateIso), day: wallOf(dateIso).day + 1 }, TZ);
  return { startsAt, endsAt, timeZone: TZ, rrule, exdates };
}

function wallOf(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return { year: y, month: m, day: d, hour: 0, minute: 0, second: 0 };
}

/** Occurrence starts as Berlin calendar dates, for readable assertions. */
function days(occurrences) {
  return occurrences.map((o) => {
    const w = toWall(o.start, TZ);
    return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  });
}

// ── wall-clock / DST ────────────────────────────────────────────

test("fromWall/toWall round-trip either side of the Berlin DST switch", () => {
  for (const iso of ["2026-01-15", "2026-03-28", "2026-03-30", "2026-07-01", "2026-11-02"]) {
    const w = { ...wallOf(iso), hour: 9 };
    assert.deepEqual(toWall(fromWall(w, TZ), TZ), w, iso);
  }
});

test("all-day events keep local midnight across the spring-forward switch", () => {
  // 2026-03-29 is the EU switch; CET+1 becomes CEST+2.
  const before = fromWall(wallOf("2026-03-28"), TZ);
  const after = fromWall(wallOf("2026-03-30"), TZ);
  assert.equal(before.toISOString(), "2026-03-27T23:00:00.000Z");
  assert.equal(after.toISOString(), "2026-03-29T22:00:00.000Z");
});

test("a monthly 09:00 series stays at 09:00 local across DST", () => {
  const start = fromWall({ ...wallOf("2026-01-03"), hour: 9 }, TZ);
  const series = {
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    timeZone: TZ,
    rrule: "FREQ=MONTHLY",
    exdates: [],
  };
  const occ = expandOccurrences(series, start, new Date("2027-01-01T00:00:00Z"));
  assert.equal(occ.length, 12);
  for (const o of occ) {
    const w = toWall(o.start, TZ);
    assert.equal(w.hour, 9, o.start.toISOString());
    assert.equal(w.day, 3);
  }
});

// ── RRULE parsing ───────────────────────────────────────────────

test("parseRRule reads the supported subset", () => {
  const r = parseRRule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1;COUNT=4");
  assert.equal(r.freq, "MONTHLY");
  assert.equal(r.interval, 3);
  assert.equal(r.count, 4);
  assert.deepEqual(r.byMonthDay, [-1]);
});

test("parseRRule rejects unsupported parts rather than dropping them", () => {
  assert.match(rruleError("FREQ=MONTHLY;BYSETPOS=-1"), /not supported/);
  assert.match(rruleError("FREQ=HOURLY"), /not supported/);
  assert.match(rruleError("FREQ=WEEKLY;COUNT=3;UNTIL=20270101T000000Z"), /both COUNT and UNTIL/);
  assert.match(rruleError("INTERVAL=2"), /must contain FREQ/);
  assert.equal(rruleError("FREQ=YEARLY"), null);
});

test("stringifyRRule round-trips", () => {
  const body = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH";
  assert.equal(stringifyRRule(parseRRule(body)), body);
});

// ── expansion ───────────────────────────────────────────────────

test("a one-off event yields itself when it overlaps the range, nothing when it does not", () => {
  const s = allDay("2026-05-04");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-05-04",
  ]);
  assert.equal(expandOccurrences(s, new Date("2026-06-01"), new Date("2026-07-01")).length, 0);
});

test("DAILY with INTERVAL and COUNT", () => {
  const s = allDay("2026-05-04", "FREQ=DAILY;INTERVAL=3;COUNT=4");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-05-04", "2026-05-07", "2026-05-10", "2026-05-13",
  ]);
});

test("WEEKLY with BYDAY emits every named weekday, never before DTSTART", () => {
  // 2026-05-04 is a Monday.
  const s = allDay("2026-05-04", "FREQ=WEEKLY;BYDAY=MO,TH;COUNT=5");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-05-04", "2026-05-07", "2026-05-11", "2026-05-14", "2026-05-18",
  ]);
});

test("MONTHLY SKIPS months too short for the day (RFC 5545), it does not clamp", () => {
  const s = allDay("2026-01-31", "FREQ=MONTHLY;COUNT=4");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-06-01"))), [
    "2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31",
  ]);
});

test("MONTHLY with BYMONTHDAY=-1 lands on the last day of each month", () => {
  const s = allDay("2026-01-31", "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-01-31", "2026-02-28", "2026-03-31",
  ]);
});

test("MONTHLY with an ordinal BYDAY (third Tuesday)", () => {
  const s = allDay("2026-01-20", "FREQ=MONTHLY;BYDAY=3TU;COUNT=3");
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-01-20", "2026-02-17", "2026-03-17",
  ]);
});

test("YEARLY honours UNTIL and stops there", () => {
  const s = allDay("2026-09-30", "FREQ=YEARLY;UNTIL=20290101T000000Z");
  assert.deepEqual(days(expandOccurrences(s, new Date("2020-01-01"), new Date("2040-01-01"))), [
    "2026-09-30", "2027-09-30", "2028-09-30",
  ]);
});

test("EXDATE removes exactly the excluded occurrence", () => {
  const base = allDay("2026-05-04", "FREQ=DAILY;COUNT=3");
  const second = expandOccurrences(base, new Date("2026-01-01"), new Date("2027-01-01"))[1];
  const s = { ...base, exdates: [second.recurrenceId] };
  assert.deepEqual(days(expandOccurrences(s, new Date("2026-01-01"), new Date("2027-01-01"))), [
    "2026-05-04", "2026-05-06",
  ]);
});

test("an open-ended series fast-forwards into a far-future window", () => {
  const s = allDay("2010-01-01", "FREQ=DAILY");
  // Range bounds are instants; anchor them to Berlin midnight so the assertion
  // is about the expansion and not about the UTC/CEST offset.
  const occ = expandOccurrences(
    s,
    fromWall(wallOf("2030-06-01"), TZ),
    fromWall(wallOf("2030-06-05"), TZ),
  );
  assert.deepEqual(days(occ), ["2030-06-01", "2030-06-02", "2030-06-03", "2030-06-04"]);
});

test("an unsatisfiable rule terminates instead of spinning", () => {
  // February-only, but the series steps a whole year at a time from January.
  const s = allDay("2026-01-15", "FREQ=MONTHLY;INTERVAL=12;BYMONTH=2");
  assert.deepEqual(expandOccurrences(s, new Date("2026-01-01"), new Date("2036-01-01")), []);
});

// ── series_end_at ───────────────────────────────────────────────

test("seriesEndAt: null for open-ended, the last occurrence for COUNT", () => {
  assert.equal(seriesEndAt(allDay("2026-05-04", "FREQ=YEARLY")), null);
  assert.equal(seriesEndAt(allDay("2026-05-04")).toISOString(), "2026-05-04T22:00:00.000Z");
  const counted = seriesEndAt(allDay("2026-05-04", "FREQ=DAILY;COUNT=3"));
  assert.equal(days([{ start: counted }])[0], "2026-05-07"); // exclusive end of the 3rd day
});

// ── ISO durations ───────────────────────────────────────────────

test("isoDurationSeconds is exact for W/D/H/M/S and null for months and years", () => {
  assert.equal(isoDurationSeconds("-P7D"), -604_800);
  assert.equal(isoDurationSeconds("-PT1H"), -3_600);
  assert.equal(isoDurationSeconds("-P1W"), -604_800);
  assert.equal(isoDurationSeconds("-P3M"), null);
  assert.equal(isoDurationSeconds("P1Y"), null);
  assert.equal(isoDurationSeconds("nope"), null);
});

test("shiftInstant does calendar arithmetic and clamps short months", () => {
  const on = (iso) => fromWall(wallOf(iso), TZ);
  const back = (d) => days([{ start: d }])[0];
  // The classic three-month Kündigungsfrist.
  assert.equal(back(shiftInstant(on("2026-11-30"), "-P3M", TZ)), "2026-08-30");
  assert.equal(back(shiftInstant(on("2026-05-31"), "-P3M", TZ)), "2026-02-28");
  assert.equal(back(shiftInstant(on("2028-05-31"), "-P3M", TZ)), "2028-02-29"); // leap year
  assert.equal(back(shiftInstant(on("2026-01-15"), "-P7D", TZ)), "2026-01-08");
  assert.equal(back(shiftInstant(on("2026-01-01"), "P1Y", TZ)), "2027-01-01");
});

// ── this-and-future split ───────────────────────────────────────

test("boundRRule splits a COUNT so the two halves still total the original", () => {
  const s = allDay("2026-05-04", "FREQ=DAILY;COUNT=6");
  const split = fromWall(wallOf("2026-05-07"), TZ);
  const { before, after } = boundRRule(s.rrule, s, split);
  assert.equal(parseRRule(before).count + parseRRule(after).count, 6);
  assert.equal(parseRRule(before).count, 3);
});

test("boundRRule caps an open-ended series with UNTIL", () => {
  const s = allDay("2026-05-04", "FREQ=WEEKLY");
  const { before } = boundRRule(s.rrule, s, fromWall(wallOf("2026-06-01"), TZ));
  assert.match(before, /UNTIL=2026/);
  assert.equal(parseRRule(before).count, null);
});

// ── iCalendar writer ────────────────────────────────────────────

test("escapeText escapes exactly the RFC 5545 TEXT specials", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  assert.equal(escapeText("Kündigung: 3 Monate"), "Kündigung: 3 Monate"); // ':' is not escaped
});

test("foldLine folds on 75 OCTETS, not characters", () => {
  const folded = foldLine("X:" + "ü".repeat(60)); // 122 octets
  const [first, second] = folded.split("\r\n");
  assert.ok(Buffer.byteLength(first, "utf8") <= 75);
  assert.ok(second.startsWith(" "));
  assert.equal(first + second.slice(1), "X:" + "ü".repeat(60));
});

test("buildCalendar emits a well-formed VCALENDAR with VTIMEZONE and VALARM", () => {
  const ics = buildCalendar({
    name: "Lexora — Vertragsfristen",
    timeZone: TZ,
    refreshMinutes: 240,
    events: [
      {
        uid: "abc@getlexora.de",
        summary: "Kündigungsfrist: Mietvertrag; Müller GmbH",
        allDay: true,
        start: fromWall(wallOf("2026-08-31"), TZ),
        end: fromWall(wallOf("2026-09-01"), TZ),
        timeZone: TZ,
        rrule: "FREQ=YEARLY",
        exdates: [fromWall(wallOf("2027-08-31"), TZ)],
        categories: ["notice"],
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        alarms: [{ trigger: "-P7D", description: "Frist läuft ab" }],
      },
    ],
  });

  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260831"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20260901"));
  assert.ok(ics.includes("EXDATE;VALUE=DATE:20270831"));
  assert.ok(ics.includes("RRULE:FREQ=YEARLY"));
  assert.ok(ics.includes("SUMMARY:Kündigungsfrist: Mietvertrag\\; Müller GmbH"));
  assert.ok(ics.includes("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P7D"));
  assert.ok(ics.includes("TRANSP:TRANSPARENT"));
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/);
  // Every line is within the folding limit.
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
  }
});

test("a timed event uses TZID rather than a bare local time", () => {
  const start = fromWall({ ...wallOf("2026-08-31"), hour: 9 }, TZ);
  const ics = buildCalendar({
    name: "x",
    timeZone: TZ,
    events: [
      {
        uid: "t@getlexora.de",
        summary: "Review",
        allDay: false,
        start,
        end: new Date(start.getTime() + 1_800_000),
        timeZone: TZ,
      },
    ],
  });
  assert.ok(ics.includes("DTSTART;TZID=Europe/Berlin:20260831T090000"));
  assert.ok(ics.includes("DTEND;TZID=Europe/Berlin:20260831T093000"));
});
