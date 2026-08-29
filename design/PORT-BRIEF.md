# Lexora redesign port — handoff brief

Port four finished HTML/CSS design artifacts into the real React app. **Frontend only.**
Branch: **`redesign/ui`** (base: `origin/redesign/ui` = commit `7068986`, which has the working
backend / auth / LLM / RAG / rate limiting).

## Progress so far (local commits on `redesign/ui`, NOT pushed)

```
7bc5657  Rebuild the design token layer: dark-first, graphite primary
44a4df7  Refine shadcn primitives onto the new tokens
```
Uncommitted WIP: `src/components/navbar.tsx`, `src/components/sidebar.tsx` (in progress).
Untracked: `src/components/brand-mark.tsx` (new), `design/` (this folder), `supabase/open-access.sql` (pre-existing, ignore).

## Remaining work, in order

1. Finish & commit `navbar.tsx` + `sidebar.tsx` (+ `brand-mark.tsx`).
2. **Landing** → `src/app/page.tsx` — hero, the working clause-analysis demo (port the artifact's
   vanilla analyser + sample data + pattern matcher into a client component with `useState`),
   features, "how it works", count-up stat band, **pricing with a Monthly/Annual toggle**
   (€149 / €189 / €250 monthly; annual −12% → €131 / €166 / €220; "Most popular" on Team;
   "Prices exclude VAT"), final CTA, footer. Keep the RDG "not legal advice" disclaimers verbatim
   (box by the demo + full notice in the footer). Landing animation via `framer-motion`,
   gated on `prefers-reduced-motion`.
3. **Onboarding + auth**:
   - New route `src/app/onboarding/page.tsx` — 4-step wizard (Profile → Workspace → First contract
     → Done) as a client component with real step state, stepper, progress bar, selection groups,
     summary built from choices, RDG disclaimer on the final step.
   - Restyle `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`
     to the split layout (form + brand panel). Theme the Clerk widget via `appearance` on
     `<ClerkProvider>` in `src/app/layout.tsx`. Small "not legal advice (RDG)" line under both forms.
4. **Dashboard** → `src/app/dashboard/page.tsx` + `layout.tsx` + `src/components/sidebar.tsx` +
   navbar app variant. Sidebar (workspace switcher, `New ▾` → Upload / Generate, nav with counts,
   user card), top bar with `⌘K` search, stat-card row (delta chips), "Portfolio risk" Recharts
   chart (keep chart types + data wiring; restyle palette to risk tokens), contracts table (file
   icons, risk pills w/ severity dot, status dots, an "Analysing…" shimmer row), analysis **drawer**
   (risk summary, flagged clauses, "Suggested wording — for your review" → Apply/Edit/Dismiss).
   Keep the persistent RDG notice bar at the top of the Contracts view. Preserve every existing
   `fetch()` call, hook, handler and the modals' behaviour exactly.
5. **Editor / review** → `src/app/review/page.tsx`. Document pane (left-rail + tint on flagged
   clauses, marker highlight on the flagged phrase, superscript cross-ref, an applied-redline
   example, floating selection toolbar) + AI review panel (tabs, Re-analyse, Add issue, expandable
   issue cards with a `− old / + new` diff, done/undo state, persistent "Ask about this contract…"
   composer). Keep the slim "not legal advice (RDG)" strip under the toolbar. Quill integration,
   all `useEffect`/state/Quill lifecycle, and every API call stay exactly as-is — restyle the
   `.quill-host` block in `globals.css`, keeping the flex/scroll mechanics.
6. **Analysis** page (`src/app/analysis/page.tsx`): bring into the same system, light touch, no
   behaviour change.
7. shadcn primitives already refined in `44a4df7`; adjust further only if needed, keep APIs identical.

## Design system (already in `globals.css` after `7bc5657` — verify against artifacts)

Dark-first. Palette (dark → light): bg `#0B0B0C`→`#FAFAF9`, surface `#151517`→`#FFFFFF`,
surface-2 `#1B1B1E`→`#F4F4F3`, surface-3 `#212125`→`#EEEEED`, paper `#17171A`→`#FFFFFF`,
border `#29292D`→`#E7E7E4`, border-strong `#37373D`→`#D9D9D5`, text `#F4F4F3`→`#1A1A18`,
text-2 `#A6A6A1`→`#5B5B57`, text-3 `#6E6E68`→`#97978F`, brand (links + focus only)
`#6AA0FF`→`#2563EB`. Risk: high `#E9827A`/`#C4362F`, med `#E0B05A`/`#B0740B`,
low `#6FC49B`/`#2F7D5B`, each with `-bg` / `-line` tints. Primary button = graphite gradient
(never blue). Inner top-highlight on raised surfaces. Radii 5 / 7 / 10 / 14 px. 1px hairlines +
soft layered shadows. Fonts: **Figtree** (UI) + **JetBrains Mono** (kbd / refs / data) via
`next/font/google` in `layout.tsx`. Theme toggle persisted to localStorage.

## The four artifacts (source of truth — read fully before coding)

Fetch each with the `Artifact` tool, `action: "read"` (owned by the user → returns raw HTML):

| Screen | Artifact URL |
|---|---|
| Landing | https://claude.ai/code/artifact/2e0f1969-0d7b-4640-a826-dfb63d6d6080 |
| Onboarding + auth | https://claude.ai/code/artifact/5f38bfa1-5153-4d37-b212-300253e16894 |
| Dashboard / workspace | https://claude.ai/code/artifact/4a26089f-36db-4827-a82b-60d172ee46d6 |
| Editor / review | https://claude.ai/code/artifact/94a3c7ab-87bb-4492-b1b3-d61c7bf53295 |

Match them faithfully — real port, restructure JSX / add presentational components as needed.
Do NOT reintroduce the earlier "Ink & Parchment" direction or any screens beyond these four.

## Hard constraints — DO NOT TOUCH

`src/app/api/**`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/rate-limit*.ts`, `src/lib/llm.ts`,
`src/lib/analysis*.ts`, `src/lib/rag*.ts`, `src/proxy.ts`, `db/**`, `supabase/**`, migrations,
and `tests/**`. No changes to data fetching, `fetch()` calls, route handlers, API shapes, the
Clerk auth flow, or business/state logic. Preserve every component's props, data flow, event
handlers and behaviour. Presentational only + the one new `onboarding` route + new presentational
components.

## Definition of done

- Logical commits on `redesign/ui`, each ending with
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- `npm test` (5 suites), `npm run build`, `npm run lint` all pass — run them, paste the tails.
- `PORT-NOTES.md` at repo root: artifact → files map, new components/routes, deviations + why,
  and the test/build/lint results.
- `git push origin redesign/ui` (flows into the existing PR #1: `redesign/ui` → `main`).
