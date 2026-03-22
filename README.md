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
| Clause Library | (Coming soon) Saved and approved clause templates |
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
