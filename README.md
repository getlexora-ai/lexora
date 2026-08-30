# Lexora — AI Legal Contract Manager

Lexora is an AI-powered legal contract intelligence platform that helps teams review, analyse, and de-risk contracts faster — without needing a lawyer in the room for every document.

## Why Lexora?

Legal contracts are dense, time-consuming, and easy to get wrong. Missing a liability clause or overlooking an auto-renewal term can cost a business significantly. Lexora solves this by:

- **Automating contract review** — AI scans the full document and surfaces High, Medium, and Low risk clauses instantly
- **Recommending safer language** — for each flagged clause, Lexora suggests a legally sound replacement you can apply in one click
- **Tracking risk over time** — a live dashboard shows documents scanned, AI fixes applied, and risk trends across your contract portfolio
- **Supporting any contract type** — NDAs, MSAs, employment contracts, SaaS agreements, leases, vendor deals, and more

## Features

| Feature | Description |
|---|---|
| Dashboard | Live stats (docs scanned, AI fixes, risk breakdown) derived from your real contract library |
| Upload Modal | Drag-and-drop PDF/DOCX upload with contract type selection |
| Analysis View | Step-by-step animated AI analysis with live progress tracking |
| Review Editor | Side-by-side Quill rich text editor and AI risk card panel with one-click clause replacement |
| Persistent Contracts | Every analysed contract is saved locally — re-open, edit, and continue fixing at any time |
| AI Fix Tracking | Green-highlighted replacements persist across sessions; fixed clause count synced to the dashboard |
| Clause Library | Reusable, statute-anchored German lease clause wording — ~33 curated clauses seeded from the RAG corpus, plus your own. Filter by topic/posture, lexical search, lawyer-reviewed flag (RDG). `/clauses` |
| Templates | (Coming soon) Contract skeletons that drive generation |
| Playbooks | (Coming soon) Per-clause review positions (accept / fallback / redline) that grade the analysis |
| Policies | (Coming soon) Company-level legal policy configuration |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Editor**: Quill (snow theme, rich text with highlight support)
- **AI**: Anthropic Claude (claude-haiku-4-5) for contract risk analysis
- **Extraction**: LLMWhisperer v2 for high-fidelity PDF text extraction
- **Charts**: Recharts
- **Icons**: Lucide React
- **Font**: Open Sans
- **Persistence**: Browser `localStorage` for contract library and editor state

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and fill in your API keys:

```
ANTHROPIC_API_KEY=...
LLMWHISPERER_API_KEY=...
LLMWHISPERER_BASE_URL=https://llmwhisperer-api.eu-west.unstract.com/api/v2
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Original-file storage

By default the uploaded PDF/DOCX is **not** retained — only the extracted text is
persisted. To keep originals (audit finding C2), configure a storage backend via
`src/lib/storage.ts`. It is **off by default**, so leaving these unset changes
nothing.

| Env var | Purpose |
|---|---|
| `STORAGE_DRIVER` | `none` (default, or unset) → storage disabled. `fs` → local filesystem. `s3` → S3/R2 (stub, not yet implemented). |
| `STORAGE_FS_DIR` | Required when `STORAGE_DRIVER=fs`. Absolute path under which originals are written as `originals/<userId>/<uuid>-<filename>` (plus a `.meta.json` sidecar for the content type). If unset, the `fs` driver stays inert. |

When enabled, `/api/extract` stores the upload and returns its opaque key as
`file_path`; `/api/contracts` persists that key on `contracts.file_path`; and
`GET /api/contracts/[id]/original` streams the file back to its owner as an
attachment. When disabled, `file_path` is `null` and the `original` route returns
404.

The `s3` driver is a documented TODO stub — selecting it throws until it is
implemented with `@aws-sdk/client-s3` (expected env: `STORAGE_S3_BUCKET`,
`STORAGE_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional
`STORAGE_S3_ENDPOINT` for R2/MinIO).

## Roadmap

### v0.3.0 — Supabase Backend
- Replace `localStorage` with Supabase for persistent, cross-device contract storage
- Database schema: `contracts`, `clauses`, `document_versions`, `users`
- File storage via Supabase Storage (original PDFs + extracted text)
- Row-level security so each user only sees their own contracts
- Auth foundation (email/password + Google OAuth)

### v0.4.0 — AI Flow Polish
- Selection-based refine: floating toolbar above highlighted text with Ask AI / Refine actions
- Chat panel improvements: message history persisted per contract, streaming responses
- Refine flow: side-by-side diff view showing original clause vs AI suggestion before applying
- Clause confidence scores and reasoning shown alongside each risk card
- Ask AI pre-fill from card context (one-click "explain this clause")

### v0.5.0 — Clause Library & Templates
- Save approved replacement clauses to a personal library
- Tag clauses by jurisdiction, contract type, and risk category
- Re-use saved clauses across contracts with one click
- Import clause packs (GDPR, US employment, SaaS standard)

### v0.6.0 — Team & Approval Workflows
- Multi-user workspaces with role-based access (viewer, editor, approver)
- Approval queue: contracts require sign-off before fixes are finalised
- Comment threads on individual clauses
- Audit log of all AI suggestions, replacements, and manual edits

### v1.0.0 — Production Ready
- Full company policy engine: define rules that flag non-compliant clauses automatically
- Bulk upload and batch analysis
- Export to PDF, DOCX, and redline format
- Webhook integrations (Slack, email) for risk alerts
- Usage analytics and billing

## Changelog

### v0.2.0
- Persistent contract library backed by `localStorage` — survives page refreshes
- Re-opening a contract restores the exact editor state: remaining risk cards and green-highlighted AI fixes
- Dashboard stats (documents, fixes, risk counts) are now computed from real contract data
- Scroll-to-highlight and independent Quill editor scroll fixed
- Rename and delete operations persist correctly

### v0.1.0
- Core UI: dashboard, upload flow, AI analysis animation, and contract review page
- Real PDF extraction via LLMWhisperer and risk analysis via Claude
