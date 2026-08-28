"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { ArrowLeft, FileText, CheckCircle2, XCircle, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileStore } from "@/lib/file-store";
import { analysisStore } from "@/lib/analysis-store";

type SavePayload = {
  name: string;
  contract_type: string;
  extracted_text: string;
  file_path: string | null;
  risk_level: "high" | "medium" | "low";
  clauses: Array<{ type: string; clause: string; passage: string; issue: string; suggestion: string; sort_order: number; source: "ai" | "user" }>;
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
    label: "Analysing with AI",
    description: "Evaluating liability, termination, IP rights, and risk markers.",
    status: "pending",
  },
  {
    label: "Cleaning and adding some magic",
    description: "Synthesising findings into high, medium, and low risk categories.",
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
  throw new Error((body.error as string) ?? fallback);
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

        const { clauses } = await analyseRes.json();
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
          clauses: clauses.map((c: { type: string; clause: string; passage: string; issue: string; suggestion: string }, i: number) => ({
            type: c.type,
            clause: c.clause,
            passage: c.passage,
            issue: c.issue,
            suggestion: c.suggestion,
            sort_order: i,
            source: "ai" as const,
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
      <div className="flex flex-col min-h-screen">
        <header className="sticky top-16 z-40 border-b bg-background/80 backdrop-blur-md">
          <div className="flex h-14 items-center px-8 gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Back to Dashboard
            </button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md text-center space-y-4">
            <div className="flex justify-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">{rateLimited ? "Usage limit reached" : "Analysis Failed"}</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            {rateLimited && !isSignedIn && (
              <SignInButton mode="modal">
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  Sign in for higher limits
                </button>
              </SignInButton>
            )}
            <Button variant={rateLimited && !isSignedIn ? "outline" : "default"} onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-header */}
      <header className="sticky top-16 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Back to Dashboard
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold truncate max-w-[320px]">{fileName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {contractType && (
              <span className="rounded bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {contractType}
              </span>
            )}
            <span className="rounded bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Draft Mode
            </span>
          </div>
        </div>
      </header>

      {/* Centered content */}
      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-2xl space-y-10">

          {/* Title block */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              AI Analysis in Progress
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Reviewing contractual obligations…</h2>
            <p className="text-muted-foreground text-base">
              Our engine is extracting clauses and identifying potential risks based on your legal policy.
            </p>
          </div>

          {/* Progress card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

            {/* Progress bar */}
            <div className="border-b bg-muted/30 px-8 py-6">
              <div className="flex items-end justify-between mb-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Overall Completion
                  </span>
                  <p className="text-3xl font-bold">{progress}%</p>
                </div>
                {done ? (
                  <span className="rounded border border-green-100 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                    Analysis Complete
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    Processing your document…
                  </span>
                )}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-in-out"
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
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className={`text-sm font-semibold ${step.status === "pending" ? "text-muted-foreground" : ""}`}>
                        {step.label}
                      </h4>
                      <StatusBadge status={step.status} />
                    </div>
                    <p className={`text-sm ${step.status === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sign-in-to-save prompt */}
            {done && !contractId && (pendingSave || saving) && (
              <div className="border-t bg-amber-50 px-8 py-4">
                {saving ? (
                  <p className="text-sm font-medium text-amber-800">Saving your contract…</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-amber-900">
                      <Lock className="h-4 w-4 shrink-0" />
                      <span>This analysis won&apos;t be saved. Sign in to keep it and edit it later.</span>
                    </div>
                    <SignInButton mode="modal">
                      <button className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700">
                        Sign in to save
                      </button>
                    </SignInButton>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="border-t bg-muted/30 px-8 py-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {completeCount} of {steps.length} steps complete
              </p>
              {done ? (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => router.push(`/review?file=${encodeURIComponent(fileName)}&type=${encodeURIComponent(contractType)}${contractId ? `&contractId=${contractId}` : ""}`)}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
                  </span>
                  Refine with AI
                </Button>
              ) : (
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel Analysis
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-green-200 bg-green-50">
        <CheckCircle2 className="h-5 w-5 text-green-600" fill="currentColor" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-20" />
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {index}
        </span>
      </span>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted text-xs font-bold text-muted-foreground">
      {index}
    </div>
  );
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span className="rounded border border-green-100 bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
        Complete
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="rounded border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
        In Progress
      </span>
    );
  }
  return (
    <span className="rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      Pending
    </span>
  );
}
