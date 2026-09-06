# Calendar — operator note

Design and rationale: [design.md](design.md). This page is the "how do I run it" half.

## Applying the migration

```bash
psql "$DATABASE_URL_UNPOOLED" -f db/012_calendar_events.sql
```

Use the **unpooled** URL: `DATABASE_URL` is Neon's PgBouncer endpoint, which cannot run the
`do $$ … $$` enum guards or `create index` reliably. The app itself keeps using the pooled
`DATABASE_URL` (`src/lib/db.ts`). The migration is re-runnable (`if not exists` /
`duplicate_object` guards) and requires the base schema (`contracts`, `set_updated_at()`,
`pgcrypto`). It has **not** been applied anywhere yet — prod Neon included.

## Environment

| Var | Needed for | Notes |
|---|---|---|
| `CALENDAR_FEED_BASE_URL` | subscription URLs | Public origin, e.g. `https://app.getlexora.de`. Falls back to `NEXT_PUBLIC_APP_URL`, then a relative path (which calendar apps will refuse). |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_SECURE` | email reminders | Exactly the set `src/lib/contact.ts` already uses — same mailbox, nothing new to provision. Only needed once the reminder worker exists. |

## How a user subscribes

1. `GET /api/calendar/feed` (Clerk-authed) returns `{ url, webcalUrl }`, minting the token on
   first call. Show it behind an "Add to your calendar" button.
2. They paste `url` into Google Calendar (*Other calendars → From URL*), Apple Calendar
   (*File → New Calendar Subscription*), or Outlook (*Add calendar → Subscribe from web*).
   `webcalUrl` makes desktop apps subscribe rather than download a one-off file.
3. Refresh cadence is the client's choice (~15 min to 24 h); we advertise 4 h.
4. `POST /api/calendar/feed` rotates the token, revoking the old URL **immediately** — every
   existing subscriber must re-add. The URL is the credential; treat a leak as a rotation.

## Reminder worker — not built

`channel = 'ics_alarm'` reminders need no worker: they ship as `VALARM` and the subscriber's
calendar fires them. `channel = 'email'` ones need a scheduled process (Railway cron, or
`node scripts/reminder-worker.mjs`) looping roughly every 15 minutes over:

```
dueReminders(new Date())        → claimReminderDispatch(due)   // null = already claimed
                                → send via the src/lib/contact.ts transporter
                                → markReminderDispatched(id, error?)
```

The claim is an `on conflict do nothing` insert, so it is safe to run more than one worker.

## Tests

`npm test` (or `node --test tests/calendar.test.mjs`) covers the recurrence maths and the
iCalendar writer. No DB, no network — the two pure modules import nothing outside themselves.
