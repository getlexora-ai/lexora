# Lexora redesign — port notes

Port of the four finished HTML/CSS design artifacts into the real React app.
Frontend only, on `redesign/ui`. Base: `7068986`.

---

## Artifact → files

| Artifact | Files |
|---|---|
| **Landing** — `2e0f1969-0d7b-4640-a826-dfb63d6d6080` | `src/app/page.tsx`, `src/components/landing/clause-demo.tsx`, `hero-preview.tsx`, `pricing.tsx`, `stat-band.tsx`, `reveal.tsx` |
| **Onboarding + auth** — `5f38bfa1-5153-4d37-b212-300253e16894` | `src/app/onboarding/page.tsx`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/components/auth-shell.tsx` |
| **Dashboard / workspace** — `4a26089f-36db-4827-a82b-60d172ee46d6` | `src/app/dashboard/page.tsx`, `src/app/dashboard/layout.tsx`, `src/components/sidebar.tsx`, `src/components/navbar.tsx` (app variant) |
| **Editor / review** — `94a3c7ab-87bb-4492-b1b3-d61c7bf53295` | `src/app/review/page.tsx`, the `.quill-host` block in `src/app/globals.css` |

Shared across all four: `src/app/globals.css` (tokens + component classes),
`src/components/brand-mark.tsx`, `theme-toggle.tsx`, `rdg-notice.tsx`.

## New routes and components

**Route**
- `src/app/onboarding/page.tsx` — the only new route. 4-step wizard, client
  component, real step state. Writes nothing, touches no auth.

**Components**
- `src/components/brand-mark.tsx` — `BrandMark`, `BrandLockup`
- `src/components/auth-shell.tsx` — `AuthTopBar`, `AuthSplit`, `AuthFormColumn`,
  `AuthBrandPanel`, `CLERK_FLUSH_APPEARANCE`
- `src/components/landing/` — `clause-demo`, `hero-preview`, `pricing`,
  `stat-band`, `reveal`
- `src/components/sidebar.tsx` — added `MobileBrandBar`

**Token layer additions** (`globals.css`, `@layer components`)
`.seg` / `.seg-btn` segmented control · `.rk` risk tag · `.cref` cross-reference
· `.hl-draw` / `.is-lit` marker reveal. Nothing was forked; these extend the
existing shadcn/Tailwind v4 `@theme` block from `7bc5657`.

---

## Deviations from the artifacts, and why

Ordered by how much a reviewer might care.

**1. No analysis drawer on the dashboard.** The workspace artifact opens a
right-hand drawer with a risk summary and flagged clauses. Building it here
would need per-contract clause fetches that do not exist on this screen, and
the constraints forbid new data fetching. The existing row-click already routes
to `/review`, which *is* that surface with real data. So the drawer's
vocabulary — risk pills, clause cards, "Suggested wording — for your review",
Apply/Refine/Dismiss — was carried into the review panel instead, where it has
something true to show. Shipping a second, fake copy on the dashboard would
have been worse than not shipping one.

**2. No delta chips on the stat cards.** The artifact shows `+6`, `+2`, `+18`.
There is no historical series behind any of them. The stat *values* are real,
computed from live contracts; inventing movement to sit beside a real number —
in a legal-risk product — is not something to ship. The tiles carry the figure
and its label only.

**3. Clerk owns the auth forms.** The artifact hand-builds email/password
fields, an SSO block and a password-strength meter. The auth flow is untouched
per the constraints, so `<SignIn>` / `<SignUp>` stay, flattened into the
artifact's form column via a per-page `appearance` (no card, no border, header
hidden) so the page's own heading is the only one. Everything else on those
screens — split layout, top bar, brand panel, quote, clause snippet, stat row,
RDG line — is ported as drawn.

**4. Segmented filter on the contracts table — the one behavioural addition.**
The artifact has an All / In review / Signed control. Shipping it inert would
be a prop, not a port, so it filters — client-side, over the `contracts` array
already in state, using the same resolved-vs-pending predicate the risk pill
uses. No fetch, no API, no existing handler changed. It sits in the table
header rather than the page head so the control and its effect stay in one
eyeshot. **If you disagree, it is one `useState` and one `.filter()` to remove**
(`src/app/dashboard/page.tsx`, `filter` / `visible`).

**5. Persistent composer in the review panel.** The artifact keeps "Ask about
this contract…" pinned below both tabs. Sending from the Review tab calls
`setSidePanel("chat")` first, so the answer is never written somewhere the
reader cannot see it. `handleChat` itself is untouched; the wrapper is
`sendFromComposer`.

**6. Hero copy does not animate in.** The artifact staggers it. It is the LCP
element — fading it from `opacity: 0` both delays that paint and risks
hydrating stuck invisible if the reduced-motion probe disagrees between server
and client. The hero's motion lives in the preview beside it (scan sweep +
staggered marker draw), which starts from a correct, visible state.

**7. Section reveals are class-driven, not inline-style-driven.** Motion's
`useInView` still triggers them, but the from-state lives in the
`prefers-reduced-motion: no-preference`-gated `.reveal` class. Two reasons:
under reduced motion there is then no from-state to undo, and server and first
client render agree, so nothing can hydrate stuck at `opacity: 0`.

**8. `motion`, not `framer-motion`.** No new dependency added — `motion@13.1.1`
was already in `package.json`; it is the same library under its current name,
imported from `motion/react`.

**9. Small honesty edits.** Sidebar items with no route (`Clause library`,
`Templates`, `Playbooks`, `Risk dashboard`, `Activity`, `Settings`) and the New ▾
menu's third item render as disabled with a `Soon` tag rather than as live
links. The rail on the review screen does the same.

---

## Fixes made along the way

- **`analysis/page.tsx` sign-in panel was unreadable in dark mode.** It was
  built from raw `amber-50` / `amber-800` / `amber-900` / `amber-600`
  utilities, which have no dark variant — near-white text on pale yellow, at
  the exact moment the panel asks for a decision. Now on the medium-risk
  tokens, which track the theme.
- **Charts were frozen to the old light palette.** `dashboard/page.tsx` held
  literal `oklch(...)` values from the Ink & Parchment direction. They now read
  `var(--high)` / `var(--med)` / `var(--low)`, so the charts re-theme with the
  toggle. Chart types and data wiring unchanged.
- **Two modal primaries were blue.** `upload-modal` and
  `create-contract-modal` overrode the Button default with
  `bg-brand text-brand-foreground`. Removed — primary is graphite, brand is
  links and focus only.
- **Dead 64px bands.** `review/page.tsx` used `h-[calc(100vh-4rem)]` and
  `analysis/page.tsx` used `sticky top-16`, both budgeting for a navbar neither
  route rendered. Now `h-dvh` and `top-0`.
- **`theme-toggle.tsx` had a lint error** (`react-hooks/set-state-in-effect`).
  Rewritten onto `useSyncExternalStore` — the theme genuinely is external state
  (`<html data-theme>` plus the OS media query), so mirroring it into an effect
  was both the error and a missed subscription. It now also tracks an OS-level
  theme change while the tab is open.

## What was not touched

`src/app/api/**`, `src/lib/db.ts`, `auth.ts`, `rate-limit*.ts`, `llm.ts`,
`analysis*.ts`, `rag*.ts`, `src/proxy.ts`, `db/**`, `supabase/**`, `tests/**`.
No data fetching, `fetch()` call, route handler, API shape or Clerk flow was
changed. `src/app/welcome/page.tsx` (auth smoke test) left as found.

`src/app/review/page.tsx` is verified byte-identical from `NAV_TABS` through
`activeClause` — 665 lines covering the Quill lifecycle, the selection and
text-change listeners, `findPassage`, and all fourteen `fetch()` calls. Only
the JSX beneath them was rewritten:

```
diff <(git show 7068986:src/app/review/page.tsx | sed -n '33,697p') \
     <(sed -n '40,704p' src/app/review/page.tsx)   # → no output
```

---

## Green gates

`npm test` — 5 files, 17 tests. **These are integration tests: they require
`npm run dev` on :3000.** With no server up, 13 of 17 fail on `ECONNREFUSED`.

```
ℹ tests 17
ℹ suites 0
ℹ pass 17
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`npm run build`

```
✓ Compiled successfully in 3.5s
✓ Generating static pages using 7 workers (16/16) in 190ms

Route (app)
┌ ○ /
├ ○ /analysis
├ ○ /dashboard
├ ○ /onboarding
├ ○ /review
├ ƒ /sign-in/[[...sign-in]]
├ ƒ /sign-up/[[...sign-up]]
└ ƒ /welcome
```

`npm run lint` — 0 errors. 6 warnings, all pre-existing and all in code the
constraints put out of bounds (unused `_setXData` setters holding the sample
chart series, a stale eslint-disable and a ref-in-cleanup note in the Quill
effect, one unused binding in `tests/`).

```
✖ 6 problems (0 errors, 6 warnings)
```

## Verification

Every route was rendered against `npm run dev` and checked for content and
console errors (`/`, `/dashboard`, `/review`, `/analysis`, `/sign-in`,
`/sign-up`, `/onboarding` — all 200, no server errors). The Chrome extension
was not connected in this session, so **the rendered result has not been
reviewed by eye** — worth a pass in the browser, particularly the review
screen's three-column breakpoints (720 / 1060px) and the light-mode palette.

## Theme refinement (post-port)

A token-level pass on top of the port, from the theme audit. It is deliberately
narrow: `src/app/globals.css` plus a single className string. No component
logic, no route handler, no `src/lib`, no `fetch` call was touched.

### `src/app/globals.css`

- **Palette re-tempered cool** in *both* themes, so light and dark read as one
  system rather than two. The light ground moves off white to `#eef0f3`, which
  gives white cards something to separate from — on a white ground a white card
  can only be found by its shadow.
- **Contrast lifts.** `--text-2` and `--text-3` were the two quiet tones doing
  most of the secondary work and both sat under the floor; they are now above
  4.5:1 on their own ground in both themes. Light `--text-2` is `#565c66`,
  `--text-3` `#71767f`.
- **Risk tints deepened.** The `-bg` fills behind high/medium/low were close
  enough to the surface that a risk pill lost its ground at a glance. Each is
  deepened and paired with a `-line` hairline in the same hue.
- **Two-tier elevation.** `--shadow-sm` / `--shadow` / `--shadow-lg` replace the
  near-invisible previous values, layered under the existing `--hl-top` inset so
  raised surfaces still read as a bevel, not a drop shadow. Exposed as
  `--shadow-e1` / `-e2` / `-e3`.
- **`--accent-wash` / `--accent-line`.** Primary actions stay graphite and blue
  stays links-and-focus only, which left the accent with nowhere to appear at
  rest. These two derived tints are that place: a selected nav row, an active
  tab, a row hover.
- **`--chart-4` / `--chart-5` re-pointed** off the old values to `#c98bd9` /
  `#5cc8c8`, so the non-risk series stop colliding with the risk hues.
- **Additive scale tokens.** `--step-*` (1.20 minor third, px-snapped) and
  `--leading-*`, surfaced through `@theme` as opt-in `text-step-*` utilities.
  Additive only — no existing `text-*` utility changes behaviour.
- **`.eyebrow`** to 11px / weight 500 / `0.06em` tracking / `--text-2`. The old
  `0.1em` at a lighter tone read as noise rather than as a label.
- **`.seg-btn` selected state** gains a 2px brand underline
  (`inset 0 -2px 0 var(--brand)`), so the segmented control shows which item is
  selected by more than a slight ground change.

Primary stays graphite. Every other class, the whole Quill block, and all
component CSS are unchanged.

### `src/components/sidebar.tsx`

One line, in `NavRow`'s active-state class: `border-border bg-surface` →
`border-[var(--accent-line)] bg-[var(--accent-wash)]`. This is the audit's one
non-token change — it is what puts the accent on screen at rest.

### Results

```
npm run lint    exit 0    ✖ 6 problems (0 errors, 6 warnings)   [pre-existing]
npm run build   exit 0    16/16 static pages, all 23 routes
npm test        exit 0    ℹ pass 17   ℹ fail 0
```

Tests are integration tests against a dev server on `:3000`; the run left no
rows behind (the write-path cases all assert the guest is *blocked*, and
`GET /api/contracts` returns `{"contracts":[]}` afterwards).

**The Chrome extension was not connected in this session, so lint/build/test is
the entire QA surface — none of this has been reviewed by eye.** The palette and
contrast changes above are the kind that want a human look, particularly light
mode, the risk pills against their new grounds, and the active nav row.
