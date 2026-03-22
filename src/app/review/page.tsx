"use client";

import "quill/dist/quill.snow.css";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analysisStore, RiskClause } from "@/lib/analysis-store";
import { contractStore } from "@/lib/contract-store";

type Risk = "high" | "medium" | "low";

const RISK_STYLES: Record<Risk, { border: string; badge: string; title: string; label: string }> = {
  high: {
    border: "border-l-red-500",
    badge: "bg-red-50 border-red-100 text-red-700",
    title: "text-red-700",
    label: "High Risk",
  },
  medium: {
    border: "border-l-amber-500",
    badge: "bg-amber-50 border-amber-100 text-amber-700",
    title: "text-amber-700",
    label: "Medium Risk",
  },
  low: {
    border: "border-l-blue-500",
    badge: "bg-blue-50 border-blue-100 text-blue-700",
    title: "text-blue-700",
    label: "Low Risk",
  },
};

const NAV_TABS = ["Review", "Compare", "History", "Approval"];

const QUILL_TOOLBAR = [
  ["bold", "italic", "underline", "strike"],
  [{ header: [1, 2, 3, false] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link"],
  ["clean"],
];

function normalise(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function findPassage(text: string, needle: string): { start: number; end: number } | null {
  const exact = text.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  const normNeedle = normalise(needle);
  const normText   = normalise(text);
  const normIdx    = normText.indexOf(normNeedle);
  if (normIdx === -1) return null;

  let origIdx = 0;
  let normCount = 0;
  while (origIdx < text.length && normCount < normIdx) {
    if (/\s/.test(text[origIdx])) {
      while (origIdx < text.length && /\s/.test(text[origIdx])) origIdx++;
      normCount++;
    } else {
      origIdx++;
      normCount++;
    }
  }
  const start = origIdx;

  let normLen = 0;
  while (origIdx < text.length && normLen < normNeedle.length) {
    if (/\s/.test(text[origIdx])) {
      while (origIdx < text.length && /\s/.test(text[origIdx])) origIdx++;
      normLen++;
    } else {
      origIdx++;
      normLen++;
    }
  }

  return { start, end: origIdx };
}

function ReviewContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fileName     = searchParams.get("file") ?? "Document";
  const contractType = searchParams.get("type") ?? "";
  const contractId   = searchParams.get("contractId");

  // diskResult is always most up-to-date (remaining clauses + delta after fixes).
  // memResult is only set immediately after a fresh analysis — fall back to it
  // if there's no saved disk data yet (edge case: localStorage unavailable).
  const diskResult = contractId ? contractStore.getData(contractId) : null;
  const memResult  = analysisStore.get();
  const result     = diskResult ?? memResult;

  // Restore the already-fixed count so the badge and stats are correct on re-open
  const savedMeta    = contractId ? contractStore.getAll().find(c => c.id === contractId) : null;
  const initialFixed = savedMeta?.issuesFixed ?? 0;

  const [clauses, setClauses]           = useState<RiskClause[]>(result?.clauses ?? []);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState("Review");
  const [fixedCount, setFixedCount]     = useState(initialFixed);

  // Sync remaining clauses to localStorage whenever a card is resolved
  useEffect(() => {
    if (!contractId) return;
    contractStore.updateClauses(contractId, clauses);
  }, [contractId, clauses]);

  // Sync fix count — skip the initial mount call to avoid a redundant write
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!contractId) return;
    if (!mountedRef.current) { mountedRef.current = true; return; }
    contractStore.updateFixed(contractId, fixedCount);
  }, [contractId, fixedCount]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quillRef        = useRef<any>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const prevHighlight   = useRef<{ start: number; length: number } | null>(null);

  // Initialise Quill once on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    // Wipe any DOM left from a previous run (React StrictMode runs effects twice)
    el.innerHTML = "";

    import("quill").then(({ default: Quill }) => {
      // If cleanup already ran, bail — prevents the second StrictMode run from
      // creating a second toolbar while the first promise resolves late.
      if (cancelled || !containerRef.current) return;

      const quill = new Quill(containerRef.current, {
        theme: "snow",
        modules: { toolbar: QUILL_TOOLBAR },
        placeholder: "Extracted contract text will appear here…",
      });

      if (diskResult?.delta) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quill.setContents(diskResult.delta as any);
        quill.history.clear();
      } else if (result?.extractedText) {
        quill.setText(result.extractedText);
        quill.history.clear();
      }

      quillRef.current = quill;
    });

    return () => {
      cancelled = true;
      quillRef.current = null;
      prevHighlight.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight the active clause and scroll to it
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;

    // Clear previous highlight
    if (prevHighlight.current) {
      quill.formatText(
        prevHighlight.current.start,
        prevHighlight.current.length,
        { background: false },
        "silent",
      );
      prevHighlight.current = null;
    }

    if (!activeCardId) return;

    const card = clauses.find(c => c.id === activeCardId);
    if (!card) return;

    const text  = quill.getText();
    const match = findPassage(text, card.passage);
    if (!match) return;

    const length = match.end - match.start;

    // Apply yellow highlight
    quill.formatText(match.start, length, { background: "#fef08a" }, "silent");
    prevHighlight.current = { start: match.start, length };

    // Scroll the highlighted span into the centre of .ql-editor (which is the
    // actual overflow:auto scroll container — scrollIntoView would scroll the page).
    requestAnimationFrame(() => {
      const editorEl = containerRef.current?.querySelector(".ql-editor") as HTMLElement | null;
      const span     = editorEl?.querySelector("[style*='background-color']") as HTMLElement | null;
      if (!span || !editorEl) return;
      const editorRect = editorEl.getBoundingClientRect();
      const spanRect   = span.getBoundingClientRect();
      // Offset of span top relative to the editor's scroll container
      const spanOffsetTop = spanRect.top - editorRect.top + editorEl.scrollTop;
      // Scroll so the span is centred
      editorEl.scrollTop = spanOffsetTop - editorEl.clientHeight / 2 + spanRect.height / 2;
    });
  }, [activeCardId, clauses]);

  function handleReplace(card: RiskClause) {
    const quill = quillRef.current;
    if (!quill) return;

    const text  = quill.getText();
    const match = findPassage(text, card.passage);
    if (match) {
      const length = match.end - match.start;
      quill.deleteText(match.start, length);
      quill.insertText(match.start, card.suggestion, { background: "#bbf7d0" });
      prevHighlight.current = null;
    }

    // Persist the updated editor content so fixes survive re-opens
    if (contractId) contractStore.updateDelta(contractId, quill.getContents());

    setClauses(prev => prev.filter(c => c.id !== card.id));
    setFixedCount(n => n + 1);
    setActiveCardId(null);
  }

  const noData = !result;
  const activeClause = clauses.find(c => c.id === activeCardId);

  return (
    // h-[calc(100vh-4rem)]: full viewport minus the 64px Navbar above
    // overflow-hidden: prevents page-level scroll so inner panels scroll independently
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sub-header */}
      <header className="shrink-0 border-b bg-background/80">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Back
            </button>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-semibold truncate max-w-[280px]">{fileName}</span>
            {contractType && (
              <span className="rounded bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {contractType}
              </span>
            )}
          </div>

          <nav className="flex items-center gap-1">
            {NAV_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>
      </header>

      {noData ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm">No analysis data found.</p>
            <Button variant="outline" onClick={() => router.push("/")}>Back to Dashboard</Button>
          </div>
        </main>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Quill editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeClause && (
              <div className="border-b bg-amber-50 px-6 py-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-amber-700 font-medium">
                  Clause highlighted — click &quot;Replace in doc&quot; on the card to apply fix
                </span>
              </div>
            )}

            {/* Quill mounts here — toolbar is injected above the ql-editor div */}
            <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden quill-host" />
          </div>

          {/* Right: AI risk cards */}
          <aside className="w-[400px] border-l flex flex-col bg-muted/20 overflow-hidden">
            <div className="px-5 py-4 border-b bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">AI Analysis</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {clauses.length} {clauses.length === 1 ? "issue" : "issues"} found
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(["high", "medium", "low"] as Risk[]).map(r => {
                    const count = clauses.filter(c => c.type === r).length;
                    if (count === 0) return null;
                    return (
                      <span
                        key={r}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_STYLES[r].badge}`}
                      >
                        {count} {r}
                      </span>
                    );
                  })}
                  {fixedCount > 0 && (
                    <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-green-50 border-green-100 text-green-700">
                      {fixedCount} fixed by AI
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {clauses.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  All issues resolved.
                </div>
              )}
              {clauses.map(card => {
                const style    = RISK_STYLES[card.type as Risk];
                const isActive = card.id === activeCardId;

                return (
                  <div
                    key={card.id}
                    onClick={() => setActiveCardId(isActive ? null : card.id)}
                    className={`rounded-lg border border-l-4 bg-card shadow-sm cursor-pointer transition-shadow ${style.border} ${
                      isActive ? "ring-2 ring-primary/30 shadow-md" : "hover:shadow-md"
                    }`}
                  >
                    <div className="px-4 pt-4 pb-3">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                        {style.label}
                      </span>
                      <h4 className={`text-sm font-semibold mt-2 mb-1 ${style.title}`}>{card.clause}</h4>
                      <p className="text-xs text-muted-foreground mb-2">{card.issue}</p>

                      <div className="rounded-md bg-muted/50 border px-3 py-2.5 mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Recommended Clause
                        </p>
                        <p className="text-xs text-foreground leading-5">{card.suggestion}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-8 gap-1"
                          onClick={e => { e.stopPropagation(); handleReplace(card); }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          Replace in doc
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-8 gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Refine
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewContent />
    </Suspense>
  );
}
