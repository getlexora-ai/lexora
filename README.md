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
| Dashboard | Overview of risk trends, documents scanned, and AI-assisted fixes |
| Upload Modal | Drag-and-drop PDF/DOCX upload with contract type selection |
| Analysis View | Step-by-step animated AI analysis with live progress tracking |
| Review Editor | Side-by-side rich text editor and AI risk card panel with one-click clause replacement |
| Clause Library | (Coming soon) Saved and approved clause templates |
| Policies | (Coming soon) Company-level legal policy configuration |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Charts**: Recharts
- **Icons**: Lucide React
- **Font**: Open Sans

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Version

**v0.1.0** — Core UI complete: dashboard, upload flow, AI analysis animation, and contract review page.
