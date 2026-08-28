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
  { step: "02", title: "AI analyses the risk", description: "Every clause is reviewed and flagged for liability, IP, termination, and compliance issues." },
  { step: "03", title: "Fix and export", description: "Apply suggested replacements directly in the editor, then export the clean document." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-28 pb-24 text-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% -10%, var(--brand-soft), transparent 65%)",
          }}
        />
        <span className="mb-7 inline-flex items-center gap-2 rounded-full ring-1 ring-border bg-card px-4 py-1.5 shadow-e1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          <span className="eyebrow text-muted-foreground">AI-powered legal contract intelligence</span>
        </span>

        <h1 className="display max-w-3xl text-5xl text-foreground sm:text-6xl lg:text-[4.5rem]">
          Review contracts in <span className="text-brand">seconds</span>, not hours
        </h1>

        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Lexora reads every clause, flags legal risk, and drafts ready-to-use
          replacements — so you can close deals faster without missing what
          matters.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-base font-medium text-primary-foreground shadow-e2 transition-colors hover:bg-primary/85"
          >
            Open dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          No credit card required · Analyse your first contract free
        </p>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-secondary/40 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow text-center text-muted-foreground">Process</p>
          <h2 className="display mt-2 text-center text-3xl sm:text-4xl">How it works</h2>
          <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
            {steps.map(({ step, title, description }, i) => (
              <div key={step} className="relative flex flex-col gap-3">
                <span className="font-mono text-sm text-brand">{step}</span>
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                {i < steps.length - 1 && (
                  <div className="absolute top-2 -right-5 hidden h-px w-10 bg-border md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow text-center text-muted-foreground">Capabilities</p>
          <h2 className="display mt-2 text-center text-3xl sm:text-4xl">Everything you need</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Built for founders, legal teams, and anyone who signs contracts.
          </p>
          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="panel p-6 shadow-e1 transition-shadow hover:shadow-e2"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                  <Icon className="h-5 w-5 text-brand" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-secondary/40 px-6 py-24 text-center">
        <h2 className="display text-3xl sm:text-4xl">
          Start reviewing smarter today
        </h2>
        <p className="mt-4 text-muted-foreground">
          No credit card required. Upload your first contract in under a minute.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-10 py-3 text-base font-medium text-primary-foreground shadow-e2 transition-colors hover:bg-primary/85"
        >
          Open dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-8 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Image src="/logo.svg" alt="Lexora" width={88} height={28} />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Lexora. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
