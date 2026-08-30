"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { ArrowLeft, FileText, CheckCircle2, XCircle, AlertCircle, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { fileStore } from "@/lib/file-store";
import { analysisStore } from "@/lib/analysis-store";

type SavePayload = {
  name: string;
  contract_type: string;
  extracted_text: string;
  file_path: string | null;
  risk_level: "high" | "medium" | "low";
  playbook_id?: string | null;
  clauses: Array<{
    type: string; clause: string; passage: string; issue: string; suggestion: string;
    sort_order: number; source: "ai" | "user";
    // Wave 4 — carried through when the analysis ran against a playbook.
    reference?: string | null;
    playbook_rule_id?: string | null;
    verdict?: "meets" | "fallback" | "redline" | null;
  }>;
};

type StepStatus = "pending" | "active" | "complete";

type Step = {
  label: string;
  description: string;
  status: StepStatus;
};

const INITIAL_STEPS: Step[] = [
  {
    label: "Extracting text from the document",
    description: "Parsing structure, headings, clauses, and definitions.",
    status: "pending",
  },
  {
    label: "Reviewing with AI",
    description: "Checking liability, termination, IP rights, and other risk markers.",
    status: "pending",
  },
  {
    label: "Sorting the findings",
    description: "Grouping each finding into high, medium, and low risk.",
    status: "pending",
  },
];

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Throw a readable Error from a failed compute-route response; flags 429s.
async function assertOk(res: Response, fallback: string, onRateLimit: () => void) {
  if (res.ok) return;
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (res.status === 429) {
    onRateLimit();
    const mins = Math.max(1, Math.round((Number(body.retry_after) || 3600) / 60));
    throw new Error(
      `You've hit the ${body.scope === "guest" ? "guest " : ""}usage limit for this action. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    );
  }
  throw new Error((body.message as string) ?? fallback);
}

function AnalysisContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fileName     = searchParams.get("file") ?? "Document";
  const contractType = searchParams.get("type") ?? "";

  const { isSignedIn } = useUser();

  const [steps, setSteps]       = useState<Step[]>(INITIAL_STEPS);
  const [progress, setProgress] = useState(0);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  // Set when the analysis finished but the save was rejected because the visitor
  // is signed out. Holds the payload so we can flush it once they sign in.
  const [pendingSave, setPendingSave] = useState<{ body: SavePayload; clauses: unknown[] } | null>(null);
  const [saving, setSaving] = useState(false);

  function setStepStatus(index: number, status: StepStatus) {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, status } : s));
  }

  // Persist a contract to the DB and remap temp clause IDs to the real ones.
  const persist = useCallback(async (body: SavePayload, clauses: unknown[]): Promise<boolean> => {
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return false; // signed out — caller shows the prompt
    if (!res.ok) return false;

    const { id, clauses: dbClauses } = await res.json();
    setContractId(id);
    let resolved = clauses as Array<{ id?: string }>;
    if (Array.isArray(dbClauses) && dbClauses.length === clauses.length) {
      resolved = (clauses as Array<Record<string, unknown>>).map((c, i) => ({
        ...c,
        id: dbClauses[i]?.id ?? (c as { id?: string }).id,
      }));
    }
    analysisStore.set({ extractedText: body.extracted_text, clauses: resolved as never });
    return true;
  }, []);

  // Once the visitor signs in, flush the save they couldn't complete.
  useEffect(() => {
    if (!isSignedIn || !pendingSave || contractId || saving) return;
    setSaving(true);
    persist(pendingSave.body, pendingSave.clauses)
      .then(ok => { if (ok) setPendingSave(null); })
      .finally(() => setSaving(false));
  }, [isSignedIn, pendingSave, contractId, saving, persist]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const file = fileStore.get();
      if (!file) {
        setError("No file found. Please go back and upload a document.");
        return;
      }

      try {
        // ── Step 1: Extract text ──────────────────────────────
        setStepStatus(0, "active");
        setProgress(5);

        const extractForm = new FormData();
        extractForm.append("file", file);

        const [extractRes] = await Promise.all([
          fetch("/api/extract", { method: "POST", body: extractForm }),
          sleep(3000), // minimum UX duration
        ]);

        if (cancelled) return;
        await assertOk(extractRes, "Text extraction failed", () => setRateLimited(true));

        const { text, file_path } = await extractRes.json();
        setStepStatus(0, "complete");
        setProgress(33);

        // ── Step 2: Analyse with Claude ───────────────────────
        if (cancelled) return;
        setStepStatus(1, "active");
        setProgress(40);

        const [analyseRes] = await Promise.all([
          fetch("/api/analyse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, contractType }),
          }),
          sleep(4000),
        ]);

        if (cancelled) return;
        await assertOk(analyseRes, "AI analysis failed", () => setRateLimited(true));

        const { clauses, playbook } = await analyseRes.json();
        setStepStatus(1, "complete");
        setProgress(75);

        // ── Step 3: Finalise ──────────────────────────────────
        if (cancelled) return;
        setStepStatus(2, "active");
        setProgress(85);

        await sleep(2000);
        if (cancelled) return;

        fileStore.clear();

        const riskLevel: "high" | "medium" | "low" = clauses.some((c: { type: string }) => c.type === "high")
          ? "high"
          : clauses.some((c: { type: string }) => c.type === "medium")
          ? "medium"
          : "low";

        const body: SavePayload = {
          name: fileName,
          contract_type: contractType,
          extracted_text: text,
          file_path: file_path ?? null,
          risk_level: riskLevel,
          playbook_id: playbook?.id ?? null,
          clauses: clauses.map((c: {
            type: string; clause: string; passage: string; issue: string; suggestion: string;
            reference?: string; playbook_rule_id?: string; verdict?: "meets" | "fallback" | "redline";
          }, i: number) => ({
            type: c.type,
            clause: c.clause,
            passage: c.passage,
            issue: c.issue,
            suggestion: c.suggestion,
            sort_order: i,
            source: "ai" as const,
            reference: c.reference ?? null,
            playbook_rule_id: c.playbook_rule_id ?? null,
            verdict: c.verdict ?? null,
          })),
        };

        // Keep the analysis viewable regardless; persist if signed in, otherwise
        // stash it and let the "sign in to save" prompt flush it later.
        analysisStore.set({ extractedText: text, clauses });
        const saved = await persist(body, clauses);
        if (!saved && !cancelled) setPendingSave({ body, clauses });

        setStepStatus(2, "complete");
        setProgress(100);
        setDone(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType]);

  const completeCount = steps.filter(s => s.status === "complete").length;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <AnalysisHeader onBack={() => router.push("/dashboard")} />
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md space-y-4 text-center">
            <div className="flex justify-center">
              <span className="grid size-12 place-items-center rounded-full border border-risk-high-line bg-risk-high-soft">
                <AlertCircle className="size-6 text-risk-high" />
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              {rateLimited ? "Usage limit reached" : "Analysis failed"}
            </h2>
            <p className="text-[13px] text-text-2">{error}</p>
            <div className="flex justify-center gap-2">
              {rateLimited && !isSignedIn && (
                <SignInButton mode="modal">
                  <Button size="lg">Sign in for higher limits</Button>
                </SignInButton>
              )}
              <Button
                size="lg"
                variant={rateLimited && !isSignedIn ? "outline" : "default"}
                onClick={() => router.push("/dashboard")}
              >
                Back to dashboard
              </Button>
            </div>
          </div>
        </main>
        <ThemeToggle floating />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AnalysisHeader
        onBack={() => router.push("/dashboard")}
        fileName={fileName}
        contractType={contractType}
      />

      {/* Centered content */}
      <main className="flex flex-1 items-start justify-center px-6 py-16">
        <div className="w-full max-w-2xl space-y-10">

          {/* Title block */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] tracking-[0.1em] text-text-3 uppercase shadow-e1">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-risk-medium opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-risk-medium" />
              </span>
              Analysis in progress
            </div>
            <h2 className="display text-3xl">Reading the contract…</h2>
            <p className="text-[15px] text-text-2">
              Lexora is extracting the clauses and marking the language that is
              commonly negotiated, for your own review.
            </p>
          </div>

          {/* Progress card */}
          <div className="panel overflow-hidden">

            {/* Progress bar */}
            <div className="border-b border-border bg-surface-2 px-8 py-6">
              <div className="mb-3 flex items-end justify-between">
                <div className="space-y-1">
                  <span className="eyebrow">Overall completion</span>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums" data-numeric>{progress}%</p>
                </div>
                {done ? (
                  <span className="pill pill-low">
                    <i />
                    Analysis complete
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-text-3">
                    Processing your document…
                  </span>
                )}
              </div>
              {/* Graphite fill, not blue: brand is reserved for links and focus. */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-[image:var(--btn-primary)] transition-[width] duration-700 ease-in-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="px-8 py-8 space-y-8">
              {steps.map((step, i) => (
                <div key={step.label} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} index={i + 1} />
                    {i < steps.length - 1 && (
                      <div className="mt-2 w-px flex-1 min-h-[36px] bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pt-1 pb-2">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <h4 className={`text-[13.5px] font-semibold ${step.status === "pending" ? "text-text-3" : ""}`}>
                        {step.label}
                      </h4>
                      <StatusBadge status={step.status} />
                    </div>
                    <p className={`text-[13px] ${step.status === "pending" ? "text-text-3" : "text-text-2"}`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sign-in-to-save prompt. Was raw amber-* utilities, which have no
                dark-mode value and rendered as near-white on the dark ground —
                now on the medium-risk tokens, which track the theme. */}
            {done && !contractId && (pendingSave || saving) && (
              <div className="border-t border-risk-medium-line bg-risk-medium-soft px-8 py-4">
                {saving ? (
                  <p className="text-[13px] font-medium text-foreground">Saving your contract…</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[13px] text-foreground">
                      <Lock className="size-4 shrink-0 text-risk-medium" />
                      <span>This analysis won&apos;t be saved. Sign in to keep it and edit it later.</span>
                    </div>
                    <SignInButton mode="modal">
                      <Button size="sm">Sign in to save</Button>
                    </SignInButton>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border bg-surface-2 px-8 py-4">
              <p className="font-mono text-[11px] text-text-3">
                {completeCount} of {steps.length} steps complete
              </p>
              {done ? (
                <Button
                  onClick={() => router.push(`/review?file=${encodeURIComponent(fileName)}&type=${encodeURIComponent(contractType)}${contractId ? `&contractId=${contractId}` : ""}`)}
                >
                  <Sparkles className="size-4" />
                  Open the review
                </Button>
              ) : (
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-3 transition-colors hover:text-risk-high"
                >
                  <XCircle className="size-3.5" />
                  Cancel analysis
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
      <ThemeToggle floating />
    </div>
  );
}

/** Shared sub-header for both the running and the failed state. */
function AnalysisHeader({
  onBack,
  fileName,
  contractType,
}: {
  onBack: () => void;
  fileName?: string;
  contractType?: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-13 items-center gap-2.5 border-b border-border bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] px-4 backdrop-blur-md">
      <Button variant="outline" size="icon-sm" aria-label="Back to dashboard" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
      </Button>
      {fileName && (
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
          <FileText className="size-4 shrink-0 text-text-3" aria-hidden />
          <span className="truncate">{fileName}</span>
        </div>
      )}
      <span className="flex-1" />
      {contractType && (
        <span className="pill pill-none">
          <i />
          {contractType}
        </span>
      )}
    </header>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisContent />
    </Suspense>
  );
}

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  if (status === "complete") {
    return (
      <div className="grid size-9 shrink-0 place-items-center rounded-full border border-risk-low-line bg-risk-low-soft">
        <CheckCircle2 className="size-4.5 text-risk-low" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <span className="relative grid size-9 shrink-0 place-items-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-risk-medium opacity-20" />
        {/* Graphite, not blue — the running step is a primary surface. */}
        <span className="btn-graphite relative grid size-9 place-items-center rounded-full text-xs font-bold">
          {index}
        </span>
      </span>
    );
  }
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-bold text-text-3">
      {index}
    </div>
  );
}

/** Mono, uppercase, hairline — the metadata register, one object per state. */
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return <span className="rk rk-low shrink-0">Complete</span>;
  }
  if (status === "active") {
    return <span className="rk rk-med shrink-0">In progress</span>;
  }
  return (
    <span className="rk shrink-0 text-text-3">Pending</span>
  );
}
