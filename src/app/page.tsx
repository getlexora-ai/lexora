import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Zap, FileSearch, BarChart3, Lock, CheckCircle } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "Instant Contract Review",
    description: "Upload any PDF or DOCX and get a full risk analysis in seconds. High, medium, and low risk clauses surfaced automatically.",
  },
  {
    icon: Zap,
    title: "One-Click AI Fixes",
    description: "Every flagged clause comes with a legally sound replacement. Apply it to the document with a single click.",
  },
  {
    icon: ShieldCheck,
    title: "Risk Intelligence Dashboard",
    description: "Track risk trends, fixes applied, and document health across your entire contract portfolio in one place.",
  },
  {
    icon: BarChart3,
    title: "Full Edit History",
    description: "Every change is versioned. Compare before and after, restore previous states, and keep a complete audit trail.",
  },
  {
    icon: Lock,
    title: "Secure by Default",
    description: "Row-level security ensures your contracts are only ever visible to you. End-to-end encrypted storage.",
  },
  {
    icon: CheckCircle,
    title: "Any Contract Type",
    description: "NDAs, MSAs, employment contracts, SaaS agreements, vendor deals, leases — Lexora handles them all.",
  },
];

const steps = [
  { step: "01", title: "Upload your contract", description: "Drag and drop a PDF or DOCX. Lexora extracts the full text with high-fidelity AI." },
  { step: "02", title: "AI analyses the risk", description: "Claude reviews every clause and flags liability, IP, termination, and compliance issues." },
  { step: "03", title: "Fix and export", description: "Apply suggested replacements directly in the editor, then export the clean document." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 py-32 text-center bg-gradient-to-b from-background to-muted/30">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(222_84%_4.9%/0.06),transparent)]" />
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          AI-powered legal contract intelligence
        </span>
        <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          Review contracts in{" "}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            seconds, not hours
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
          Lexora uses AI to scan every clause, flag legal risks, and suggest ready-to-use replacements — so you can close deals faster without missing what matters.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-8 py-2.5 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Open dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/20 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map(({ step, title, description }) => (
              <div key={step} className="flex flex-col gap-3">
                <span className="text-4xl font-black text-muted-foreground/20 tracking-tighter">{step}</span>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">Everything you need</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Built for founders, legal teams, and anyone who signs contracts.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border bg-background p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/20 px-6 py-24 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight">
          Start reviewing smarter today
        </h2>
        <p className="mt-4 text-muted-foreground">
          No credit card required. Upload your first contract in under a minute.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-10 py-2.5 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Open dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t px-8 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Image src="/logo.svg" alt="Lexora" width={88} height={28} />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Lexora. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
