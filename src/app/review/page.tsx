"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { analysisStore, RiskClause } from "@/lib/analysis-store";

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalise(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// Find the start index in `text` that best matches `needle`,
// tolerating whitespace differences and case.
function findPassage(text: string, needle: string): { start: number; end: number } | null {
  // 1. Exact match first
  const exact = text.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  // 2. Normalise both sides and search
  const normNeedle = normalise(needle);
  const normText   = normalise(text);
  const normIdx    = normText.indexOf(normNeedle);
  if (normIdx === -1) return null;

  // Map normalised index back to original text by walking character by character
  let origIdx = 0;
  let normCount = 0;
  while (origIdx < text.length && normCount < normIdx) {
    if (/\s/.test(text[origIdx])) {
      // skip all consecutive whitespace in original (counts as 1 space in normalised)
      while (origIdx < text.length && /\s/.test(text[origIdx])) origIdx++;
      normCount++; // the single space
    } else {
      origIdx++;
      normCount++;
    }
  }
  const start = origIdx;

  // Walk forward by the length of the normalised needle
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

function buildEditorHtml(text: string, activeOriginal: string | null): string {
  if (!activeOriginal) return escapeHtml(text);

  const match = findPassage(text, activeOriginal);
  if (!match) return escapeHtml(text);

  const before = escapeHtml(text.slice(0, match.start));
  const clause = escapeHtml(text.slice(match.start, match.end));
  const after  = escapeHtml(text.slice(match.end));

  return `${before}<mark class="bg-yellow-200 rounded-sm px-0.5">${clause}</mark>${after}`;
}

function ReviewContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fileName     = searchParams.get("file") ?? "Document";
  const contractType = searchParams.get("type") ?? "";

  const result = analysisStore.get();

  const [editorText, setEditorText] = useState(result?.extractedText ?? "");
  const [clauses, setClauses]       = useState<RiskClause[]>(result?.clauses ?? []);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState("Review");

  const editorRef = useRef<HTMLDivElement>(null);

  const activeClause = clauses.find(c => c.id === activeCardId) ?? null;

  const editorHtml = useMemo(
    () => buildEditorHtml(editorText, activeClause?.passage ?? null),
    [editorText, activeClause],
  );

  // Scroll highlighted mark into view when active clause changes
  useEffect(() => {
    if (!activeCardId) return;
    const mark = editorRef.current?.querySelector("mark");
    if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeCardId]);

  function handleReplace(card: RiskClause) {
    setEditorText(prev => {
      const match = findPassage(prev, card.passage);
      if (!match) return prev;
      return prev.slice(0, match.start) + card.suggestion + prev.slice(match.end);
    });
    setClauses(prev => prev.filter(c => c.id !== card.id));
    setActiveCardId(null);
  }

  const noData = !result;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-header */}
      <header className="sticky top-16 z-40 border-b bg-background/80 backdrop-blur-md">
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

          {/* Tab nav */}
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
        // No analysis data — prompt user to go back and upload
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm">No analysis data found.</p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Dashboard
            </Button>
          </div>
        </main>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="border-b bg-muted/30 px-6 py-2 flex items-center gap-1 flex-wrap">
              {[
                { icon: Bold,         label: "Bold" },
                { icon: Italic,       label: "Italic" },
                { icon: Underline,    label: "Underline" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  title={label}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              <div className="w-px h-5 bg-border mx-1" />
              {[
                { icon: List,         label: "Bullet list" },
                { icon: ListOrdered,  label: "Numbered list" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  title={label}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              <div className="w-px h-5 bg-border mx-1" />
              {[
                { icon: Link,  label: "Insert link" },
                { icon: Image, label: "Insert image" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  title={label}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              {activeClause && (
                <>
                  <div className="w-px h-5 bg-border mx-1" />
                  <span className="text-xs text-amber-600 font-medium">
                    Clause highlighted — click &quot;Replace in doc&quot; to apply fix
                  </span>
                </>
              )}
            </div>

            {/* Editor area — rendered with highlight */}
            <div className="flex-1 overflow-y-auto px-12 py-10">
              <div className="max-w-3xl mx-auto">
                <div
                  ref={editorRef}
                  className="text-sm leading-7 whitespace-pre-wrap text-foreground outline-none"
                  dangerouslySetInnerHTML={{ __html: editorHtml }}
                />
              </div>
            </div>
          </div>

          {/* Right: AI cards sidebar */}
          <aside className="w-[400px] border-l flex flex-col bg-muted/20 overflow-hidden">
            <div className="px-5 py-4 border-b bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">AI Analysis</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {clauses.length} {clauses.length === 1 ? "issue" : "issues"} found
                  </p>
                </div>
                <div className="flex gap-1.5">
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
                const style   = RISK_STYLES[card.type as Risk];
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
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0 ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                      <h4 className={`text-sm font-semibold mb-1 ${style.title}`}>{card.clause}</h4>
                      <p className="text-xs text-muted-foreground mb-2">{card.issue}</p>

                      {/* Recommended clause */}
                      <div className="rounded-md bg-muted/50 border px-3 py-2.5 mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Recommended Clause
                        </p>
                        <p className="text-xs text-foreground leading-5">{card.suggestion}</p>
                      </div>

                      {/* Actions */}
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
