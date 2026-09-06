# Calendar events — storage design

_Design + implementation notes for the calendar-events layer (`db/012_calendar_events.sql`,
`src/lib/calendar.ts`, `src/lib/calendar-rrule.ts`, `src/lib/calendar-ics.ts`,
`src/app/api/calendar/**`). Written against `db/schema.sql` and the conventions in
[H6 — Database schema](../workflows/h6-database-schema.md)._

> **Status:** code + migration only. `db/012` has **not** been applied to any database.
> See [README.md](README.md) for the operator steps.

---

## 0. What this is for

Lexora's contracts carry dates that cost money when missed:

| Date | German framing | Typical shape |
|---|---|---|
| Notice deadline | **Kündigungsfrist** — the last day you can still terminate | one-off, 3 months before `Vertragsende` |
| Automatic renewal | **Automatische Verlängerung** | one-off, or yearly once the contract rolls |
| Contract end | **Vertragsende** | one-off |
| Review | internal "read this again" date | yearly |

Events are **per-user** (`user_id text`, the Clerk id — no FK, no RLS, ownership enforced in
the route handlers per `src/lib/auth.ts`). They are optionally attached to a contract
(`contract_id uuid references contracts (id) on delete cascade`, nullable), so deleting a
contract takes its deadlines with it.

### Delivery: an .ics subscription, not OAuth

Decided before this document; recorded here because the schema follows from it.

The DB is the **source of truth**. Users get the dates into their real calendar by
subscribing to a per-user read-only iCalendar feed:

```
GET /api/calendar/feed/<token>.ics    →  text/calendar
```

authenticated by a random per-user token, because a calendar app cannot run a Clerk session.
Rejected alternative: Google Calendar / Microsoft Graph write integration —

* OAuth consent screens, verification review, and refresh-token lifecycle for a feature
  that is fundamentally "show me a date";
* GDPR: pushing contract titles ("Kündigungsfrist Mietvertrag Müller GmbH") into a US
  processor is a transfer we would have to paper and disclose, for no user benefit over a
  feed;
* two-way sync is a distributed-consistency problem (who wins when both sides edit?) that
  we would own forever.

The feed is one-way, cacheable, revocable, and works in Apple Calendar, Google Calendar,
Outlook and Thunderbird with a paste.

---

## 1. Schema for simple and recurring events

### The three options

| | A. RRULE + expand at read | B. Materialised occurrences | C. Hybrid (rule + materialised window) |
|---|---|---|---|
| Storage | 1 row per series | 1 row per occurrence, forever | 1 row per series + N rows in a rolling window |
| "Move all future ones" | 1 UPDATE | rewrite N rows | 1 UPDATE + rebuild window |
| Infinite series | free | impossible (needs a horizon) | needs a horizon |
| Range query | index scan + CPU expansion | pure index scan | pure index scan |
| Reminder scan | expand per candidate | trivial | trivial |
| `.ics` feed | emit the rule, client expands | emit N VEVENTs | emit the rule |
| Failure mode | CPU on a pathological rule | silent drift when the window lapses | both, plus a rebuild job to own |

### Recommendation: **A — one row per series, expanded at read time**

For Lexora's scale and shape:

1. **The volume is tiny.** A heavy user has tens of contracts and a handful of dates each —
   O(100) rows per user, not the O(10⁵) of a busy work calendar. Expansion is measured in
   microseconds and is bounded by the requested range.
2. **The feed does not need expansion at all.** This is the decisive point. RFC 5545 was
   designed for exactly this: we emit one `VEVENT` carrying `RRULE` + `EXDATE`, and the
   subscriber's calendar app expands it. So the busiest read path in the product —
   the .ics poll — is `O(rows)` regardless of how far a yearly deadline runs.
3. **Materialising has no upside here.** Option B buys a cheaper range scan we do not need,
   and pays for it with a rewrite on every edit, a horizon we must keep pushing forward with
   a cron job, and a whole class of "the window lapsed and the deadline vanished" bugs.
   For a product whose entire value is *not missing a date*, that failure mode is
   disqualifying.
4. **The one real cost — CPU on a hostile rule — is bounded in code.**
   `expandOccurrences` caps at `MAX_ITERATIONS = 20_000` / `MAX_OCCURRENCES = 3_000`, the
   API caps a requested range at ~3 years, and `parseRRule` rejects the parts we do not
   support instead of silently mis-expanding.

Option C is the escalation path if the reminder scan ever becomes the bottleneck: it can be
added later purely as a derived table, with no change to `calendar_events`.

### `rrule`

`calendar_events.rrule text` holds an RFC 5545 RRULE **body without the `RRULE:` prefix**
(`FREQ=YEARLY`, `FREQ=MONTHLY;BYMONTHDAY=1`, `FREQ=WEEKLY;BYDAY=MO,TH`). `NULL` = one-off.
Storing the standard string rather than decomposed columns means the value we store is the
value we hand a calendar client, byte for byte.

Supported subset (`src/lib/calendar-rrule.ts`): `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY),
`INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (with ordinals for MONTHLY/YEARLY), `BYMONTHDAY`
(including negatives, `-1` = last day), `BYMONTH`, `WKST` (accepted, ignored). Everything
else — `BYSETPOS`, `BYYEARDAY`, `BYWEEKNO`, sub-daily frequencies — **throws at write time**.
A deadline that quietly expands to the wrong dates is worse than a rejected form.

### Why no `rrule` npm package

The brief allowed either. We went dependency-free, deliberately:

* `rrule.js` expands in a floating pseudo-UTC and pushes IANA-zone handling back to the
  caller (or to a `luxon` peer dependency). Lexora's *entire* recurrence difficulty is the
  zone — see below — so we would be writing the hard half ourselves regardless.
* Calendar clients expand the feed's RRULE themselves. Our expander only serves the in-app
  list and the reminder scan, over a bounded window, for deadline-shaped series.
* The supported subset is ~400 lines with no supply-chain surface, and it is pure
  (no imports, relative import into the ICS writer), so it unit-tests under plain
  `node --test` like `src/lib/rate-limit-core.ts` does — see
  `tests/calendar.test.mjs` (25 cases: DST round-trips, the RFC "skip short months"
  rule, BYDAY ordinals, EXDATE, COUNT/UNTIL splitting, octet folding, VTIMEZONE).

If a user ever needs `BYSETPOS` ("last working day of the quarter"), reconsider — but that
is not a Kündigungsfrist.

### Timezone handling — `Europe/Berlin` and DST

This is the part that is easy to get wrong.

* `starts_at` / `ends_at` are `timestamptz` — absolute instants for the **first**
  occurrence. `ends_at` is **exclusive**, matching RFC 5545 `DTEND`.
* `time_zone text not null default 'Europe/Berlin'` is *not* decoration. It is the zone the
  recurrence **expands in**.

Why it matters: a review date on the 3rd of every month at 09:00 must stay on the 3rd at
09:00 across the March and October switches. If you expand by adding milliseconds to an
instant, it drifts to 08:00 or 10:00 and, for an all-day event, can slide onto the wrong
day. So `expandOccurrences` converts `starts_at` to a **wall-clock** struct in `time_zone`
(via `Intl.DateTimeFormat.formatToParts`), does all the calendar arithmetic there, and
converts back with a two-pass offset solve (`fromWall`). Duration is likewise carried as a
**civil** delta, not milliseconds, so an all-day event spanning the switch still ends at
midnight rather than 23:00.

The two-pass solve is exact everywhere except *inside* a transition, where the wall time is
either ambiguous (the repeated hour — we take the first) or non-existent (the skipped hour —
we land just after the jump). Both are fine for all-day and business-hours deadlines, and
both are documented at the function.

Germany-only means `Europe/Berlin` is the default everywhere and the only zone with a
`VTIMEZONE` block in the feed; any other zone falls back to emitting UTC instants, which is
always valid.

### All-day vs timed

One flag, `all_day boolean not null default true` (deadlines are all-day by default), and
**no separate `date` column**. An all-day event is stored as the half-open instant range
`[local midnight, next local midnight)`; the feed emits `DTSTART;VALUE=DATE:20260331`,
derived by formatting the instant in `time_zone`.

Trade-off: an all-day event is anchored to a zone, so a user reading it from another
timezone sees it on the boundary day the zone implies. Given Germany-only, this is the right
side of the trade — one uniform `timestamptz` range predicate for every query beats a
`date`/`timestamptz` union and its two index paths.

### Recurrence end — `series_end_at`

The range query must not have to expand a rule to know whether a series can possibly reach
the window. So `series_end_at timestamptz` is denormalised at write time by `seriesEndAt()`:

* no rrule → `ends_at`
* `UNTIL` → `until + duration` (deliberately generous; it only ever *excludes* rows, so
  erring late costs a wasted expansion, never a missed deadline)
* `COUNT` → the COUNT-th occurrence's end (bounded — `COUNT` is capped at 3 000 at parse)
* neither → **`NULL`, meaning "never ends"**

`NULL` rather than `'infinity'::timestamptz` because node-postgres decodes `infinity` to the
JS number `Infinity`, not a `Date` — a type wart in every consumer. The predicate is
`(series_end_at is null or series_end_at > $from)`.

### `exdates`

`exdates timestamptz[] not null default '{}'`, keyed by each cancelled occurrence's
**original** start (the RFC 5545 `RECURRENCE-ID`). Deleting one occurrence appends to the
array; the expander skips any occurrence whose `recurrenceId` is in the set; the feed emits
them as `EXDATE`.

An array rather than a child table: the cardinality is a handful, it is always read with its
parent row, and it maps 1:1 onto the wire format. A child table would buy indexed lookup we
never do.

### Editing: this / this-and-future / all

`PATCH /api/calendar/[id]?scope=…&occurrence=<iso>`. `occurrence` is the occurrence's
**original** start, not wherever a previous edit moved it — that is what keeps its identity
stable across repeated edits.

| Scope | Mechanism |
|---|---|
| `all` (default) | UPDATE the series row; `series_end_at` recomputed. Every occurrence follows. |
| `this` | Insert an **override row**: same table, `recurrence_parent_id` = series, `recurrence_id` = the original start. Upserted on the unique index `(recurrence_parent_id, recurrence_id)`. The expander prefers it over the generated occurrence; the feed emits it as a second `VEVENT` with the **same UID** and a `RECURRENCE-ID`. |
| `this_and_future` | **Split.** `boundRRule()` caps the original with `UNTIL` just before the occurrence, and a new series row starts at the occurrence with the patch applied. `split_from_id` records the provenance. Reminders are copied to the new half; later overrides are re-parented. A `COUNT` is divided between the halves so the two still total the original. |

Deleting mirrors this: `all` soft-deletes the series and its overrides; `this` appends to
`exdates`; `this_and_future` caps with `UNTIL`.

This is RFC 5545's own model, which is why it round-trips through the feed without a
translation layer.

### Soft delete

`deleted_at timestamptz`, matching `clause_library` / `contract_templates` / `playbooks`.
Every read filters `deleted_at is null`. A deadline the user deleted by mistake is
recoverable; more practically, it keeps `reminder_dispatches` rows meaningful.

---

## 2. Event templates & reminders

### Templates — reusable event skeletons

`calendar_event_templates` is a **derivation rule**, not a saved event:

```
anchor    ∈ {contract_start, contract_end, notice_deadline, signature_date, custom}
offset_iso  signed ISO-8601 duration from that anchor
```

"Notice deadline: 3 months before contract end" is
`anchor = 'contract_end', offset_iso = '-P3M'`. "Annual review" is
`anchor = 'contract_start', offset_iso = 'P1Y', rrule = 'FREQ=YEARLY'`.

`title_template` carries `{{contract_name}}` / `{{contract_type}}` / `{{notice_period}}`
placeholders, the same convention as `contract_templates.body`. `user_id NULL` = curated and
read-only through the API, matching every other library table in the schema.

**Months stay ISO strings, never seconds.** `-P3M` from 30 November is 31 August; from 31 May
it is 28/29 February. `shiftInstant()` does that arithmetic in wall-clock terms and
**clamps** to the end of a short month — the same rule Postgres `interval` uses and the one
German notice periods assume. (Note this deliberately differs from recurrence expansion,
which per RFC 5545 **skips** months too short to contain the day.)

`applyTemplate()` returns `null` when the anchor date is unknown, so an unextracted
`Vertragsende` can never become a deadline on 1970-01-01.

### Reminders — lead-time offsets

`calendar_event_reminders` stores an **offset**, not a date, so it applies to every
occurrence of a series:

| Column | Why |
|---|---|
| `offset_iso` | the RFC 5545 `TRIGGER` value verbatim (`-P7D`, `-P1D`, `-PT1H`) — emitted into `VALARM` unchanged |
| `offset_seconds` | the same value normalised, signed, for the due-scan |
| `channel` | `ics_alarm` (the subscriber's calendar fires it — free, offline, no worker) or `email` (we send it) |
| `label` | overrides the default German alarm text |

Both columns exist because only one is useful for each job, and keeping them consistent is
enforced by *rejecting years and months*: `reminderOffsetSeconds()` throws on `-P1M`.
That is not a limitation, it is the correct model — **"three months before the contract
ends" is a Kündigungsfrist deadline in its own right (its own derived event), not a lead
time on one.** Lead times are days and hours. Cap: one year.

### Firing exactly once — `reminder_dispatches`

There is **no pre-materialised queue**. A queue would need a horizon, a backfill job, and
invalidation on every event edit — the same trap as materialised occurrences.

Instead the (unbuilt) worker does:

1. `dueReminders(now, graceSeconds)` — SQL narrows to `email` reminders on series that could
   plausibly have an occurrence in the window (one index range scan on
   `calendar_events_due_scan_idx`), then each `(reminder, occurrence)` pair is expanded
   exactly in JS. `fire_at = occurrence.start + offset`; `graceSeconds` (default 6 h) bounds
   how late a reminder may still be sent after a worker outage — past that, the deadline has
   usually gone and a late email is noise.
2. `claimReminderDispatch(due)` —
   ```sql
   insert into reminder_dispatches (reminder_id, event_id, occurrence_start, fire_at)
   values (…) on conflict (reminder_id, occurrence_start) do nothing returning id
   ```
   **Winning the insert is the lock.** Two workers racing the same occurrence, or a retry
   after a crash, cannot both send. Returns `null` for the loser.
3. send
4. `markReminderDispatched(id, error?)` → `sent` or `failed` (with `attempts`), so
   `reminder_dispatches_pending_idx` (`where status in ('pending','failed')`) is a retry
   sweep.

### Delivery hook

Deliberately left as an interface. Delivery would reuse the SMTP transporter already in
`src/lib/contact.ts` (`SMTP_HOST/PORT/USER/PASS/SECURE`) — the same mailbox, the same
timeouts, the same "never throws" contract. The worker itself (a Railway cron or a
`node scripts/reminder-worker.mjs` on a schedule) is **not built**; `dueReminders` /
`claimReminderDispatch` / `markReminderDispatched` are the whole surface it needs.

---

## 3. Synchronisation strategy

Two separate questions hide under "sync". Keep them apart.

### 3a. Getting dates to the user's calendar — pull, via .ics

**Model:** the client polls; we never push. `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` advertise
4 hours, but the cadence is entirely the client's: Google refreshes roughly every 8–24 h,
Apple offers 5 min–1 week, Outlook is its own weather system. Design for "somewhere between
15 minutes and a day, and you do not control it."

**Making an unchanged poll nearly free** — the point of the whole design:

* `feedValidators(userId)` is two index reads: `count(*)` and `max(updated_at)` over the
  user's events, plus `max(updated_at)` over their reminders, hashed into a weak `ETag` and
  an HTTP-date `Last-Modified`.
* `If-None-Match` (or `If-Modified-Since`, for the clients that only speak that) matching →
  **304, no body built**. This is where most polls land.
* Only on a real change do we call `buildFeedCached(userId)`.
* `Cache-Control: private, max-age=…, must-revalidate`. **`private` is mandatory** — the body
  is one user's contract deadlines and must never sit in a shared proxy.
* `X-Robots-Tag: noindex, nofollow`, and a bad token is **404, not 401** (a 401 confirms the
  URL shape and invites a retry; there is nothing to authenticate as).

**Why the feed query stays efficient**, independent of how far the deadlines run:

* It emits **series, not occurrences** — one `VEVENT` per row plus one per override. Zero
  expansion server-side.
* It is a single indexed range scan on `calendar_events_user_range_idx (user_id, starts_at)
  where deleted_at is null`, bounded to [now − 365 d, now + 730 d].
* Reminders come back in one `= any($1::uuid[])` batch, not N+1.
* Token resolution is one unique-index probe on a narrow table.

**Token storage: a dedicated `calendar_feed_tokens` table**, not a column on a settings row.
Lexora has no per-user settings table today and inventing one to hold a token means
designing a row lifecycle we do not otherwise need. A table also lets a token carry
`last_used_at` / `use_count` / `last_user_agent` (useful observability for a bearer
credential that lives in a URL and gets pasted into third-party apps), supports several live
tokens per user, and makes revocation a row update instead of a settings rewrite. Rotation
(`POST /api/calendar/feed`) revokes **immediately**, with no grace period: the reason to
rotate is that the URL leaked.

**A future one-way push to Google** (explicitly out of scope) would need: an OAuth client +
verification, a `calendar_external_links` table (user, provider, refresh token, remote
calendar id, per-event remote id + `etag`), a push job triggered off the same cache-
invalidation points as `revalidateTag`, conflict policy (Lexora always wins — the link is
one-way), a token-revocation path, and a DPA/transfer disclosure. The schema is ready for it:
a `calendar_events` row is already a stable, addressable series with a stable UID. Nothing
here needs to change to add it.

### 3b. Keeping derived events in step with contract dates

When a contract's `Vertragsende` changes, its notice deadline must move.

**Options.** *Event-sourced* (derive dates on the fly from `contracts` every read, store
nothing) vs *snapshotted copies* (materialise rows, regenerate on change).

**Recommendation: snapshotted, re-derivable copies.** Event-sourcing loses on three counts
that matter here:

1. The `.ics` feed and the reminder scan need **plain queryable rows**. A virtual event
   cannot be range-scanned, cannot carry a `reminder_dispatches` row, and cannot appear in a
   `VEVENT` with a stable UID.
2. A user must be able to **edit or dismiss** a derived deadline ("we already sent notice").
   A pure projection has nowhere to put that.
3. Contracts have no date columns yet — the dates come out of extraction/analysis. A
   projection would have to re-run that on every read.

**How regeneration stays honest** (`syncContractEvents`):

* `source_key text` = the stable identity of a derivation (`<template_id>:<anchor>`), with
  `unique (contract_id, source_key) where source_key is not null and deleted_at is null`.
  Regeneration is therefore an **idempotent upsert**, not delete-and-recreate — which
  matters because delete-and-recreate would change the UID and make every subscriber's
  calendar duplicate the event instead of updating it.
* `user_modified boolean` is set the moment a user touches a derived row. The upsert carries
  `do update … where calendar_events.user_modified = false`, so a human decision is **never**
  silently overwritten; those rows come back as `skipped` so the UI can offer
  "this contract's dates changed — review this deadline".
* Derivations that no longer apply (anchor date removed, template deleted) are soft-deleted,
  again only when untouched.

**Where to call it:** wherever a contract's key dates change — after extraction, after
analysis, after a manual date edit. It takes a `ContractKeyDates` argument rather than
reading `contracts` because those columns do not exist yet; when they land, this shrinks to
a join.

---

## 4. Caching strategy

Three layers, because they fail differently.

### 4.1 Next.js data cache — `unstable_cache` + `revalidateTag`

| Entry point | Tag | `revalidate` | Returns |
|---|---|---|---|
| `listOccurrencesCached(userId, from, to)` | `calendar:<userId>` | 300 s | `SerialisedOccurrence[]` |
| `buildFeedCached(userId)` | `calendar:feed:<userId>` | 900 s | `{ ics, etag, lastModified }` |

Tag names (`src/lib/calendar.ts`):

```ts
calendarTag(userId)          // "calendar:<userId>"          — list views, expansion
calendarFeedTag(userId)      // "calendar:feed:<userId>"     — the serialised .ics
calendarContractTag(id)      // "calendar:contract:<id>"     — a contract's dates
```

**Invalidation points — every write, no exceptions.** `invalidate(userId, contractId)` is
called at the end of `createEvent`, `updateEvent` (all three scopes), `deleteEvent` (all
three scopes), `addReminder`, `deleteReminder`, and `syncContractEvents`. It fires
`revalidateTag(tag, "max")` for the user tag and the feed tag, plus the contract tag when
there is one.

Two Next 16 details worth knowing:

* **`revalidateTag` now takes two arguments.** The single-argument form is deprecated and
  does not type-check. `"max"` gives stale-while-revalidate rather than a blocking miss.
  (`updateTag` would be the read-your-own-writes choice, but it is Server-Actions-only and
  these are route handlers.)
* **`unstable_cache` is deprecated** in favour of `'use cache'`, which needs
  `cacheComponents: true` in `next.config.ts` — not enabled in this app. The swap is
  mechanical when it is.

**The serialisation trap:** `unstable_cache` round-trips values through the data cache's
serialiser, so `Date` objects come back as strings on a hit and as `Date`s on a miss — a
type-safety landmine. Cached functions here therefore return **JSON-safe shapes only**:
`SerialisedOccurrence` (ISO strings, which is exactly what the API returns anyway) and the
feed's plain strings. Raw pg rows, which carry `Date`s, are never cached.

`invalidate()` is wrapped in try/catch: the reminder worker is a plain node process with no
request scope, where `revalidateTag` throws. A failed invalidation is a stale read at worst —
never a reason to fail a write that already committed.

### 4.2 The `.ics` response cache + ETag

Covered in §3a. The layering is deliberate: `feedValidators` is **uncached** (it is two
index reads and it has to be right the instant after a write), while the *body* is cached
under `calendar:feed:<userId>`. So a poll that changed nothing costs one hash comparison,
and a poll after a change costs one serialisation shared by every subsequent poll.

### 4.3 In-process expanded-occurrence cache

A module-level `Map` on `globalThis` (hot-reload-safe, same trick as `src/lib/db.ts`), keyed
`(userId, rangeStart, rangeEnd)`, 60 s TTL, FIFO-capped at 200 entries. It absorbs the burst
of identical expansions a single page render makes. Freshness is provided by the TTL and by
the tag invalidation above it; it is a micro-optimisation, not a correctness mechanism, and
it is safe to delete.

### What NOT to cache

* **Per-request auth.** `currentUserId()` reads Clerk's session — `unstable_cache` forbids
  `headers`/`cookies` inside a cache scope anyway.
* **`resolveFeedToken`.** A revoked token must die on the next request. Never cached.
* **`feedValidators` / `feedFingerprint`.** They *are* the freshness signal.
* **`dueReminders`.** The worker must see live state, and it runs outside a request scope.
* **Raw `CalendarEvent` rows.** `Date` fields, see the serialisation trap above.

---

## 5. Efficiency checklist

**Indexes** (`db/012_calendar_events.sql`):

| Index | Serves |
|---|---|
| `calendar_events_user_range_idx (user_id, starts_at) where deleted_at is null` | the list query **and** the feed query |
| `calendar_events_contract_idx (contract_id, starts_at) where …` | "this contract's dates" |
| `calendar_events_override_idx (recurrence_parent_id, recurrence_id) where … ` **unique** | folding overrides in; the `scope=this` upsert target |
| `calendar_events_source_key_idx (contract_id, source_key) where …` **unique** | the idempotent regeneration upsert |
| `calendar_events_due_scan_idx (starts_at) where deleted_at is null and recurrence_parent_id is null` | the cross-user reminder scan — **must not** lead on `user_id` |
| `calendar_event_reminders_event_idx (event_id)` / `…_email_idx … where channel='email'` | VALARM batch; worker join |
| `reminder_dispatches_once_idx (reminder_id, occurrence_start)` **unique** | the exactly-once claim |
| `reminder_dispatches_pending_idx (fire_at) where status in ('pending','failed')` | retry sweep |
| `calendar_feed_tokens_token_idx (token)` **unique** | the hottest unauthenticated probe in the product |

**Query shapes:**

* Range predicate is always
  `user_id = $1 and starts_at < $to and (series_end_at is null or series_end_at > $from)` —
  index-led on `(user_id, starts_at)`, with `series_end_at` as a filter on the few rows that
  survive.
* Masters and their overrides come back in **one** round trip (a CTE + `union all`), never
  N+1.
* Reminders for a feed are one `= any($1::uuid[])`.
* The reminder scan is one range scan, then per-pair expansion in JS — never
  `expand-then-filter` over the whole table.
* Expansion fast-forwards its period index to the range start whenever the rule has no
  `COUNT`, so a ten-year-old daily series costs the same as a fresh one.
* The feed emits **rules, not occurrences** — O(rows), not O(occurrences).
* Every expansion is bounded (20 000 iterations / 3 000 occurrences); every API range is
  capped (~3 years).

**Escalation path if it ever gets slow:** a GiST index over
`(user_id, tstzrange(starts_at, series_end_at))` (needs `btree_gist`) turns the range
predicate into a true overlap operator. At current cardinality plain btree wins on both
size and planning cost, so this is documented rather than done.

---

## 6. What is deliberately not built

* The **reminder worker** (cron/queue + the SMTP send). Interface only:
  `dueReminders` → `claimReminderDispatch` → `markReminderDispatched`.
* **Curated calendar templates** — no seed script yet. `db/012` creates the table and the
  `curated` visibility rules; a `scripts/seed-calendar-templates.mjs` would follow the shape
  of `scripts/seed-playbooks.mjs`.
* **UI.** No calendar page, no "add to your calendar" button. The API is complete enough to
  build against.
* **One-way push to Google/Microsoft** — see §3a for what it would take.
* **Contract date columns.** `syncContractEvents` takes `ContractKeyDates` from the caller
  because `contracts` has no `starts_on` / `ends_on` / `notice_period` columns yet. That is
  the natural `db/013`.
