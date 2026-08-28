# Lexora Redesign — "Ink & Parchment"

**Branch:** `redesign/ui`
**Scope:** UI-only. No backend, API, data-fetching, or business-logic changes anywhere in this branch — every commit touches only JSX structure, `className`, `globals.css` tokens, and small presentational subcomponents. Component props and exported interfaces are unchanged throughout.

This document covers the full redesign: the design system foundation (inherited from `458b97b`, extended here), the palette and type tokens, the rationale behind them, and a per-screen account of what changed and why.

---

## 1. Design rationale

Lexora is a tool for reading dense legal text under time pressure and trusting an AI's judgment about risk. Two things follow from that:

1. **The chrome has to disappear.** Long contract passages need a warm, low-fatigue reading surface, generous whitespace, and restrained ornament — the interface should feel like a well-made paper file, not a SaaS dashboard fighting for attention. This is where the "Parchment" half of the name comes from: a warm off-white ground (not clinical pure white), near-flat elevation (hairline rings + soft ambient shadows, never hard drop-shadows), and a generous, slightly editorial radius scale.

2. **Colour has to mean something every time.** In a product whose entire value proposition is "we'll tell you what's risky," a reviewer must be able to trust that anything coloured is a signal, not decoration. So the system enforces one rule everywhere: **chrome is warm monochrome ink; chromatic colour is reserved for two purposes** — risk semantics (high / medium / low / resolved) and a single brand accent ("Iris") that marks AI-agentic affordances (Refine, Ask AI, Export, Generate, chat) and nothing else. This redesign's main sweep, beyond the visual refresh, was hunting down every place the original UI used decorative/arbitrary colour — indigo-for-no-reason badges, sky-blue "in progress" chips, ad-hoc amber toasts — and remapping each one onto this rule. A colour that shows up in three unrelated contexts (a warning banner, a status chip, a hover state) teaches the user to stop reading it; a colour with exactly one job stays legible.

Layout/spacing/trust-cue principles were informed by a review of legalfly.com's design language (generous section rhythm, restrained type scale, quiet enterprise trust cues, hairline borders over heavy card shadows) — principles only; palette, exact spacing values, and visual identity here are original to Lexora.

The design-system foundation (tokens, three-face type system, Quill re-theming) was established in commit `458b97b` on this branch and is treated as the base to build on, not replace.

---

## 2. Palette

All colours are defined as [OKLCH](https://oklch.com) in `src/app/globals.css`, with a full parallel `.dark` block. OKLCH keeps perceptual lightness consistent across hues, which is why every risk colour and the brand colour sit at nearly the same L (~0.46–0.475) — they read as equally "loud" instead of amber accidentally out-shouting red.

### Chrome (warm monochrome)

| Token | Light (oklch) | Swatch | Usage |
|---|---|---|---|
| `--background` | `0.966 0.005 85` | `#f5f4f0` | Page ground — warm parchment, not pure white |
| `--foreground` | `0.19 0.008 75` | `#161310` | Body text, headings |
| `--card` | `0.992 0.004 85` | `#fefcf9` | Card/panel surfaces — lifts slightly off the ground |
| `--primary` | `0.23 0.01 68` | `#201c18` | Default buttons, primary CTAs (near-black ink) |
| `--secondary` | `0.944 0.006 82` | `#eeece8` | Secondary surfaces |
| `--muted` | `0.938 0.007 82` | `#edeae5` | Muted fills (table zebra, subtle backgrounds) |
| `--muted-foreground` | `0.46 0.012 70` | `#5c5751` | Secondary text — pinned at L≈0.46 to clear 4.5:1 on both background and card |
| `--border` | `0.893 0.008 82` | `#dedbd6` | Hairline borders everywhere |

### Brand — "Iris" (AI-agentic affordances only)

| Token | Light (oklch) | Swatch | Usage |
|---|---|---|---|
| `--brand` | `0.47 0.17 285` | `#5644b4` | Refine, Ask AI, Export, Generate, chat — any control that invokes the AI |
| `--brand-soft` | `0.958 0.022 285` | `#efefff` | Brand chip/banner backgrounds |
| `--brand-line` | `0.9 0.045 285` | — | Brand chip/banner borders |

Hue 285 was chosen because it sits maximally far from every risk hue (25 / 62 / 155 / 245) — an AI control can never be mistaken for a risk signal at a glance, even by a colour-blind reviewer relying on hue alone plus the icon/label.

### Risk semantics

| Token | Light (oklch) | Swatch | Meaning |
|---|---|---|---|
| `--risk-high` | `0.475 0.185 25` | `#ac0f1e` | High-risk clause |
| `--risk-high-soft` | `0.958 0.022 25` | `#ffecea` | High-risk chip/card background |
| `--risk-medium` | `0.475 0.115 62` | `#894a00` | Medium-risk clause; also reused for "needs attention" banners (guest mode, rate-limit toast) since amber-as-caution is the same signal at a coarser grain |
| `--risk-medium-soft` | `0.958 0.03 75` | `#fdefdc` | — |
| `--risk-low` | `0.475 0.1 245` | `#216190` | Low-risk clause |
| `--risk-low-soft` | `0.958 0.022 245` | `#e5f3ff` | — |
| `--risk-ok` | `0.455 0.09 155` | `#246540` | Resolved / fixed / "no risk" / success states |
| `--risk-ok-soft` | `0.958 0.028 155` | `#e3f7e9` | — |

Every risk token ships a `-soft` (background) and `-line` (border) pair alongside the solid text/icon colour, so a badge/chip is always built from the same three-part recipe: soft fill, line border, solid text.

### Editor marks

`--mark-focus` (warm yellow, `oklch(0.93 0.11 95)`) and `--mark-applied` (soft green, `oklch(0.92 0.09 155)`) are the two highlight colours a reviewer sees *inside the Quill document itself* — active-clause highlight and "fix just applied," respectively. These are referenced live via `var(--mark-focus)` / `var(--mark-applied)` in the inline styles Quill writes into the DOM, so they're theme-reactive (dark mode gets its own values) without any JS changes.

### Dark mode

The `.dark` block (from `458b97b`, unchanged in substance here) inverts the same relationships: background/foreground swap, all risk and brand tokens re-tuned to stay legible and equally-loud against the dark ground, shadows swap from a soft ambient pool to a subtle inset top bevel (`.bevel` / `--shadow-e-inset`) since drop shadows disappear against a dark surface. Every token used in this redesign resolves correctly in both themes because the redesign consistently referenced tokens (`bg-risk-high-soft`, `text-brand`, etc.) rather than literal Tailwind colours — with one deliberate, documented exception (see §5).

---

## 3. Type system

Three faces, unchanged from `458b97b`, used consistently across every screen touched in this pass:

- **Inter** (`--font-sans`) — the workhorse. All UI chrome, body copy, data-dense surfaces (tables, forms, the review panel).
- **Fragment Mono** (`--font-mono`) — the metadata register, applied via the `.eyebrow` component class (0.6875rem, uppercase, `0.1em` tracking, `muted-foreground`). Used for section labels, stat-card headers, table column headers, and contract-type chips — anything that's a machine-derived value or a structural label rather than prose. This redesign extended `.eyebrow` usage into places that previously used ad-hoc `text-xs uppercase tracking-widest` combinations (dashboard stat cards, table headers, review panel labels), consolidating them onto the one class.
- **Instrument Serif** (`--font-serif`) — editorial display only, via the `.display` component class. Used for the landing-page hero and section headers, the analysis-page headline, and the welcome-page/auth empty-state register. Never used in dense UI (tables, cards, buttons).

Headings tighten to `-0.022em` tracking; anywhere two numbers are compared (stat cards, table cells, progress percentages) gets `font-variant-numeric: tabular-nums` via the `[data-numeric]` attribute or the existing `th`/`td`/`time` base rule.

---

## 4. Spacing, radius, elevation

Inherited from `458b97b` and used as-is:

- **Radius** scales from `--radius-sm` (control-level, ~0.525rem) up to `--radius-4xl` (~2.275rem for hero-level containers), all derived from a single `--radius: 0.875rem` base via `calc()`. Because these are defined as Tailwind theme tokens (`--radius-lg`, `--radius-xl`, …), every `rounded-lg` / `rounded-xl` class in the codebase — including ones this pass didn't touch directly — automatically picks up the new scale.
- **Elevation** is near-flat: `--shadow-e1/e2/e3` combine a 1px hairline ring with a very soft, warm-tinted ambient shadow (never a generic grey `0 4px 12px` card shadow). This redesign applied the `e1`/`e2`/`e3` scale consistently to primitives that previously used ad-hoc `shadow-sm`/`shadow-md`/`shadow-lg`/`shadow-xl` (Card, Dialog, Popover, Select, chart tooltip, review clause cards, floating selection toolbar).
- **`.panel`** — the standard hairline-bordered card treatment (`bg-card` + `border-radius: var(--radius)` + 1px border via box-shadow) — used for the landing feature cards, the analysis progress card, and the welcome-page card.

---

## 5. Per-screen changes

### Shadcn primitives (`src/components/ui/*`)
Card, Dialog, Popover, Select, and the chart tooltip moved from `ring-foreground/10` + `shadow-md/xl` to the token-driven elevation scale (`ring-border` + `shadow-e1/e2/e3`) and the generous radius scale. `CardTitle` picked up the heading weight/tracking. Button, Badge, Table, Separator, and Tooltip were already built against the token system (`bg-card`, `text-muted-foreground`, etc.) from prior work and needed no changes — verified by inspection rather than left untouched by oversight.

### Navbar (`src/components/navbar.tsx`)
Softer hairline border, backdrop blur retained on the bare (landing) variant, `primary/85` hover instead of `/90` to match the softer interaction states used everywhere else in the redesign. Both the bare and app-page variants are covered; behaviour (auth-state branching, sign-in/sign-up modals) is untouched.

### Sidebar (`src/components/sidebar.tsx`)
Moved off hard-coded `muted`/`accent` classes onto the dedicated `sidebar-*` tokens (`bg-sidebar`, `bg-sidebar-accent`, `border-sidebar-border`) that `458b97b` defined but that weren't yet wired into this component. Section label and "Soon" chips use `.eyebrow`. The active nav link now gets the `.panel`-style treatment (hairline ring + `shadow-e1`) instead of a flat border. **Generate Contract** is now brand-coloured — it's the one AI-agentic affordance in the sidebar's chrome. Narrowed from `w-72` to `w-64` to tighten control density; no links, routes, or the `?generate=1` handoff logic changed.

### Landing page (`src/app/page.tsx`)
Full visual rebuild, same content/copy/structure. Replaced the stock indigo→violet gradient hero and generic shadcn styling with: a serif display headline, a brand-tinted radial wash (was a hard-coded dark-mode-oriented `hsl()` gradient that didn't actually respond to theme), an eyebrow-labelled pulse badge using the brand hue instead of a decorative emerald dot, and `.panel`-treatment feature cards with brand-soft icon chips. Section labels (`Process`, `Capabilities`) use `.eyebrow` for a consistent editorial rhythm between "How it works" and "Everything you need." Same six features, same three steps, same `/dashboard` CTAs.

### Dashboard (`src/app/dashboard/page.tsx`)
- **Charts** (Recharts `BarChart` / `AreaChart` / `LineChart` — same three chart types, same data wiring, same hooks/state): series colours now use literal `oklch()` values matching brand/risk-ok/risk-high/risk-medium/risk-low instead of stock indigo/emerald/red/amber/blue hex constants. Grid lines and axis ticks use the border/muted-foreground tokens. (See the dark-mode caveat below — this is the one deliberate exception to "always reference tokens.")
- **Guest banner** and **seed-data error strip**: moved from raw `amber-*`/`red-*` Tailwind classes to `risk-medium`/`risk-high` soft+line tokens.
- **Table risk badges** and **"No Risk" badge**: use the risk-* soft/line/text trio instead of green/red/amber/blue.
- **Stat-card and table-header labels**: consolidated onto `.eyebrow`.

`dashboard/layout.tsx` needed no changes — it's a two-line flex wrapper around `Sidebar` + `main`.

### Analysis (in-progress) page (`src/app/analysis/page.tsx`)
This screen is entirely an AI-agentic affordance (it exists to show the AI working), so the brand token now carries it end-to-end: the "AI Analysis in Progress" badge, the active-step pulse indicator, the progress-bar fill, and the "Refine with AI" CTA all moved from `primary`/`sky` to `brand`. Completed-state chips (progress-card badge, step icons, status badges) moved from raw `green-*` to `risk-ok`. The progress card adopted `.panel`; the headline adopted `.display`. Polling logic, step sequencing, and the rate-limit/error branch are untouched.

### Review page (`src/app/review/page.tsx`)
The largest and most colour-dense screen; also the one with the most legacy raw-colour debt.
- **`RISK_STYLES`** (the single object that drives every risk-coloured surface on this screen — card left-border, badge, title) now maps to the risk-* token trio instead of `red-500`/`amber-500`/`blue-500` etc. Because it's centralized, this one edit fixed the clause cards, the remaining-issue-count chips, and the card titles in one pass.
- **Quill in-editor highlights**: the two literal hex values Quill was writing into its delta (`#fef08a` for the active-clause highlight, `#bbf7d0` × 2 for "fix just applied") now write `var(--mark-focus)` / `var(--mark-applied)` — tokens `458b97b` defined for exactly this purpose but that weren't wired up yet. Because these resolve live in the DOM style attribute, they're theme-reactive for free.
- **AI-agentic controls** — Refine (both the card toggle and the inline apply button), Ask AI, Export Report, the chat send button, Re-analyse, and the floating selection toolbar (Ask AI / Refine / Apply) — all moved from `primary`/neutral to `brand`, consistent with the rule established on the analysis page.
- **"Added by you" / "Yours"** tags (marking a user-authored clause, not an AI or risk signal) moved from an unassigned `indigo-*` to a neutral outline chip — indigo had no defined meaning in the system and sat uncomfortably close to the brand hue, risking exactly the AI/non-AI confusion the palette is designed to prevent.
- Rate-limit toast: `amber-*` → `risk-medium` soft/line.
- Dismissed-clause list and various inline forms: hairline `border-border` applied consistently (several were missing an explicit border colour and relying on Tailwind's default).

All state (`useState`/`useRef`), all `useEffect`s (Quill lifecycle, highlight-on-select, DB fetch-on-mount, auto-dismiss toast), and every API call are byte-for-byte unchanged — only `className` values and the two Quill inline-style colour literals changed.

### Auth pages (`sign-in`, `sign-up`, `welcome`)
Sign-in/sign-up page shells get the same brand-soft radial wash as the landing hero (previously a bare centred `<div>`). The Clerk widget itself is themed via the `appearance` prop on `ClerkProvider` in `src/app/layout.tsx`, set up in `458b97b` and already correctly token-matched (`colorPrimary`/`colorBackground`/`colorText`/`colorDanger`/`colorSuccess`/`colorWarning` map to `--primary`/`--card`/`--foreground`/`--destructive`/`--risk-ok`/`--risk-medium`, and `borderRadius: 0.7rem` already matches `--radius-md`) — left as-is, no changes needed. Welcome page's success state moved from raw `green-600` to `risk-ok` and adopted `.panel`.

### Modals (`upload-modal.tsx`, `create-contract-modal.tsx`)
AI-facing cues — the upload drop-zone icon, the "AI Enhancement Active" banner, the Analyze/Generate CTAs, the create-contract dialog's Sparkles icon, and the selected-file-chip icon (previously an unrelated `destructive`-red icon on a plain file chip) — all moved to `brand`. Form field radii/borders standardized to `rounded-lg`/`border-border` across both modals. No props, validation, or submit-flow logic changed in either component.

---

## 6. Known gaps / deliberately left for later

- **Chart series colours are static, not theme-reactive.** Recharts renders literal SVG attributes, and `stroke`/`fill` values passed as JS string constants don't repaint on a `.dark` class toggle the way a CSS `var()` reference in an inline *style* attribute would. The dashboard chart colours were recoloured to match the light-theme token values (this was already the pre-existing pattern — the original code used hard-coded hex too) but will look slightly off-palette if a user switches to dark mode without a page reload. A proper fix would read the resolved CSS custom property value in a `useEffect` (or switch the three charts to `<linearGradient>`/`stroke` definitions driven by CSS classes with a `currentColor` trick) — left as a follow-up since it's the one place in this pass where a fully theme-reactive solution would have required touching component behaviour, not just presentation.
- **`.dark` block was not independently re-audited** beyond confirming every token this redesign referenced has a dark-mode counterpart already defined in `458b97b`. Light is the primary, required theme per the brief; dark mode renders correctly and coherently but wasn't given the same level of pixel-level scrutiny as light.
- **Review page's "Compare / History / Approval" tabs** remain the pre-existing "Coming Soon" placeholder — out of scope (no functionality exists yet to redesign around).
- **Sidebar's "Clause Library" / "Policies" / "Settings" / "Support"** remain the pre-existing disabled "Soon" links — same reasoning.
- **No new iconography or illustration** was introduced; all icons remain `lucide-react`, recoloured in place.

---

## 7. Verification

- `npm install` — clean.
- `npm run build` — passing after every commit in this branch.
- `npm run lint` — 0 errors after every commit (pre-existing warnings in `dashboard/page.tsx`, `review/page.tsx`, and `tests/rate-limit.test.mjs` are unrelated to this redesign — unused-variable and exhaustive-deps warnings that predate this branch).
- `tests/*.test.mjs` are integration tests against API route behaviour (auth gates, rate limits, clause corrections) — they assert on HTTP status codes and JSON shapes, not markup or class names, so nothing in this redesign required or risked changing them.
