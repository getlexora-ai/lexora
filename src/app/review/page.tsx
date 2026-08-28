"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Sparkles, Send, Loader2, MessageSquare, Plus, X } from "lucide-react";
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
  const isCreateMode = searchParams.get("mode") === "create";

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
  const [dbLoading, setDbLoading]       = useState(!!contractId && !result);

  // User corrections: dismissed ("not an issue") clauses + the "add missed issue" form
  const [dismissedClauses, setDismissedClauses] = useState<RiskClause[]>([]);
  const [dismissingId, setDismissingId]         = useState<string | null>(null);
  const [dismissReason, setDismissReason]       = useState("");
  const [showDismissed, setShowDismissed]       = useState(false);
  const [addingIssue, setAddingIssue]           = useState(false);
  const [addLoading, setAddLoading]             = useState(false);
  const emptyAddForm = { passage: "", clause: "", type: "high" as Risk, issue: "", suggestion: "" };
  const [addForm, setAddForm]                   = useState(emptyAddForm);

  // Refine state: which card is open + user input + loading
  const [refiningId, setRefiningId]       = useState<string | null>(null);
  const [refineNote, setRefineNote]       = useState("");
  const [refineLoading, setRefineLoading] = useState(false);

  // Ask AI chat state
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [sidePanel, setSidePanel]     = useState<"issues" | "chat">(isCreateMode ? "chat" : "issues");
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [reanalysing, setReanalysing] = useState(false);

  // Floating selection toolbar
  type SelectionToolbar = { top: number; left: number; text: string };
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbar | null>(null);
  const [selectionRefineOpen, setSelectionRefineOpen] = useState(false);
  const [selectionRefineNote, setSelectionRefineNote] = useState("");
  const [selectionRefineLoading, setSelectionRefineLoading] = useState(false);

  // Set by any compute route returning 429; shown as a transient toast.
  const [computeError, setComputeError] = useState<string | null>(null);
  // Returns the message when `res` is a 429 (and shows the toast), else null.
  function rateLimitNote(res: Response, data: { retry_after?: number; scope?: string }): string | null {
    if (res.status !== 429) return null;
    const mins = Math.max(1, Math.round((Number(data.retry_after) || 3600) / 60));
    const msg = `Usage limit reached${data.scope === "guest" ? " — sign in for higher limits" : ""}. Try again in about ${mins} min.`;
    setComputeError(msg);
    return msg;
  }

  // On mount: fetch from Supabase when contractId is present.
  // This is the source of truth for re-opens — gives us only pending clauses,
  // the latest quill_delta (with green fix highlights), and the real issues_fixed count.
  useEffect(() => {
    if (!contractId) return;

    fetch(`/api/contracts/${contractId}`)
      .then(r => r.json())
      .then(({ contract }) => {
        if (!contract) return;

        type DbClause = {
          id: string; type: string; clause: string;
          passage: string; issue: string; status: string;
          suggestion: string; refined_suggestion?: string;
          source?: "ai" | "user"; sort_order: number;
        };
        const toClause = (c: DbClause): RiskClause => ({
          id: c.id,
          type: c.type as RiskClause["type"],
          clause: c.clause,
          passage: c.passage,
          issue: c.issue,
          suggestion: c.refined_suggestion ?? c.suggestion,
          source: c.source ?? "ai",
        });
        const bySort = (a: DbClause, b: DbClause) => a.sort_order - b.sort_order;
        const all: DbClause[] = contract.risk_clauses ?? [];

        // Only show clauses still pending in DB (replaced ones are gone)
        const pending = all.filter(c => c.status === "pending").sort(bySort).map(toClause);
        const dismissed = all.filter(c => c.status === "dismissed").sort(bySort).map(toClause);

        setClauses(pending);
        setDismissedClauses(dismissed);
        setFixedCount(contract.issues_fixed ?? 0);

        // Restore chat history from DB
        fetch(`/api/contracts/${contractId}/chat`)
          .then(r => r.json())
          .then(({ messages }) => {
            if (Array.isArray(messages) && messages.length > 0) {
              setChatHistory(messages.map((m: { role: "user" | "assistant"; content: string }) => ({
                role: m.role,
                content: m.content,
              })));
            }
          })
          .catch(() => {/* non-critical */});

        // Apply DB content to Quill — if Quill is already mounted apply now,
        // otherwise store it so the Quill init effect picks it up.
        const dbContent = {
          delta: contract.quill_delta ?? undefined,
          text:  contract.extracted_text ?? undefined,
        };
        const quill = quillRef.current;
        if (quill) {
          if (dbContent.delta) {
            quill.setContents(dbContent.delta);
          } else if (dbContent.text) {
            quill.setText(dbContent.text);
          }
          quill.history.clear();
        } else {
          pendingDbContent.current = dbContent;
        }
      })
      .catch(err => console.error("[review] fetch contract failed:", err))
      .finally(() => setDbLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quillRef        = useRef<any>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const prevHighlight   = useRef<{ start: number; length: number } | null>(null);
  // Holds the DB contract data when it arrives before Quill is ready
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingDbContent = useRef<{ delta?: any; text?: string } | null>(null);

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

      // Prefer DB content (arrived before Quill was ready) → then localStorage → then in-memory
      const pending = pendingDbContent.current;
      if (pending?.delta) {
        quill.setContents(pending.delta);
        pendingDbContent.current = null;
      } else if (pending?.text) {
        quill.setText(pending.text);
        pendingDbContent.current = null;
      } else if (diskResult?.delta) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quill.setContents(diskResult.delta as any);
      } else if (result?.extractedText) {
        quill.setText(result.extractedText);
      }
      quill.history.clear();

      quillRef.current = quill;

      // Debounced auto-save: persist quill_delta to Supabase 2s after the user stops typing.
      // Only fires for user-initiated changes (source === "user"), not programmatic ones.
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      quill.on("text-change", (_delta: unknown, _old: unknown, source: string) => {
        if (source !== "user") return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const cid = searchParams.get("contractId");
          if (!cid) return;
          const contents = quill.getContents();
          fetch(`/api/contracts/${cid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quill_delta: contents }),
          }).catch(err => console.error("[quill text-change] save delta failed:", err));
        }, 2000);
      });

      // Show floating toolbar when user selects text
      quill.on("selection-change", (range) => {
        if (!range || range.length === 0) {
          setSelectionToolbar(null);
          setSelectionRefineOpen(false);
          return;
        }
        const selected = quill.getText(range.index, range.length).trim();
        if (!selected) return;

        // Use the actual DOM selection rect for pixel-perfect positioning
        requestAnimationFrame(() => {
          const domSel = window.getSelection();
          if (!domSel || domSel.rangeCount === 0) return;
          const selRect       = domSel.getRangeAt(0).getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (!containerRect) return;

          // Toolbar sits 8px above the selection, centred horizontally over it
          const top  = selRect.top  - containerRect.top  - 8;
          const left = selRect.left - containerRect.left + selRect.width / 2;
          setSelectionToolbar({ top, left, text: selected });
          setSelectionRefineOpen(false);
          setSelectionRefineNote("");
        });
      });
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

    const delta = quill.getContents();

    // Persist to localStorage (fast, local fallback)
    if (contractId) contractStore.updateDelta(contractId, delta);

    // Persist to Supabase: update quill_delta on the contract. The issues_fixed
    // counter is bumped server-side by the clause PATCH below (status: replaced).
    if (contractId) {
      fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quill_delta: delta }),
      }).catch(err => console.error("[handleReplace] contract patch failed:", err));

      // Update clause status to replaced (also bumps contracts.issues_fixed)
      fetch(`/api/contracts/${contractId}/clauses/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "replaced" }),
      }).catch(err => console.error("[handleReplace] clause patch failed:", err));
    }

    setClauses(prev => prev.filter(c => c.id !== card.id));
    setFixedCount(n => n + 1);
    setActiveCardId(null);
  }

  // "Not an issue" — dismiss a false-positive clause. Guests mutate local state only.
  function handleDismiss(card: RiskClause, reason: string) {
    if (contractId) {
      fetch(`/api/contracts/${contractId}/clauses/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed", dismissed_reason: reason || undefined }),
      }).catch(err => console.error("[handleDismiss] clause patch failed:", err));
    }
    setClauses(prev => prev.filter(c => c.id !== card.id));
    setDismissedClauses(prev => [card, ...prev.filter(c => c.id !== card.id)]);
    setDismissingId(null);
    setDismissReason("");
    if (activeCardId === card.id) setActiveCardId(null);
  }

  // Restore a dismissed clause back into the active list.
  function handleRestore(card: RiskClause) {
    if (contractId) {
      fetch(`/api/contracts/${contractId}/clauses/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      }).catch(err => console.error("[handleRestore] clause patch failed:", err));
    }
    setDismissedClauses(prev => prev.filter(c => c.id !== card.id));
    setClauses(prev => [...prev.filter(c => c.id !== card.id), card]);
  }

  // "+ Add issue" — record a clause the AI missed. Guests add to local state only.
  async function handleAddIssue() {
    const f = addForm;
    const payload = {
      type: f.type,
      clause: f.clause.trim(),
      passage: f.passage.trim(),
      issue: f.issue.trim(),
      suggestion: f.suggestion.trim(),
    };
    if (!payload.clause || !payload.passage || !payload.issue || !payload.suggestion) return;

    setAddLoading(true);
    try {
      if (contractId) {
        const res = await fetch(`/api/contracts/${contractId}/clauses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.clause) {
          setComputeError(data.message ?? "Couldn't add the issue. Please try again.");
          return;
        }
        const c = data.clause as {
          id: string; type: RiskClause["type"]; clause: string;
          passage: string; issue: string; suggestion: string; refined_suggestion?: string;
        };
        setClauses(prev => [{
          id: c.id,
          type: c.type,
          clause: c.clause,
          passage: c.passage,
          issue: c.issue,
          suggestion: c.refined_suggestion ?? c.suggestion,
          source: "user",
        }, ...prev]);
      } else {
        setClauses(prev => [{
          id: `user-${Date.now()}`,
          type: payload.type,
          clause: payload.clause,
          passage: payload.passage,
          issue: payload.issue,
          suggestion: payload.suggestion,
          source: "user",
        }, ...prev]);
      }
      setAddForm(emptyAddForm);
      setAddingIssue(false);
    } finally {
      setAddLoading(false);
    }
  }

  // Always use the live Quill text so the AI sees fixes already applied
  function liveText() {
    return quillRef.current?.getText() ?? result?.extractedText ?? "";
  }

  async function handleRefine(card: RiskClause) {
    if (!refineNote.trim()) return;
    setRefineLoading(true);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passage: card.passage,
          currentSuggestion: card.suggestion,
          userNote: refineNote.trim(),
          contractText: liveText(),
        }),
      });
      const data = await res.json();
      if (rateLimitNote(res, data)) return;
      if (!res.ok) {
        setComputeError(data.message ?? "Couldn't refine that clause. Please try again.");
        return;
      }
      if (data.refined) {
        // Save refinement record to Supabase
        if (contractId) {
          fetch(`/api/contracts/${contractId}/clauses/${card.id}/refinements`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_note:      refineNote.trim(),
              refined_output: data.refined,
              was_applied:    false,
            }),
          }).catch(err => console.error("[handleRefine] save refinement failed:", err));

          // Also update the stored refined_suggestion on the clause row
          fetch(`/api/contracts/${contractId}/clauses/${card.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refined_suggestion: data.refined }),
          }).catch(err => console.error("[handleRefine] clause patch failed:", err));
        }

        setClauses(prev =>
          prev.map(c => c.id === card.id ? { ...c, suggestion: data.refined } : c)
        );
        setRefiningId(null);
        setRefineNote("");
      }
    } finally {
      setRefineLoading(false);
    }
  }

  function saveChatMessage(role: "user" | "assistant", content: string) {
    if (!contractId) return;
    fetch(`/api/contracts/${contractId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    }).catch(err => console.error("[chat] save message failed:", err));
  }

  async function handleChat() {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    const next: ChatMsg[] = [...chatHistory, { role: "user", content: q }];
    setChatHistory(next);
    setChatInput("");
    setChatLoading(true);
    saveChatMessage("user", q);
    try {
      let answer = "";

      if (isCreateMode) {
        // In create mode: AI edits the document directly and explains what changed
        const res = await fetch("/api/contract-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: q,
            currentDocument: liveText(),
            history: chatHistory,
          }),
        });
        const data = await res.json();
        answer = rateLimitNote(res, data)
          ?? (res.ok ? (data.explanation ?? "Contract updated.")
                     : (data.message ?? "The assistant hit an error. Please try again."));
        if (data.updatedDocument && quillRef.current) {
          quillRef.current.setText(data.updatedDocument);
          quillRef.current.history.clear();
          // Save updated delta to Supabase if we have a contractId
          if (contractId) {
            fetch(`/api/contracts/${contractId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ quill_delta: quillRef.current.getContents() }),
            }).catch(() => {});
          }
        }
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            contractText: liveText(),
            history: chatHistory,
          }),
        });
        const data = await res.json();
        answer = rateLimitNote(res, data)
          ?? (res.ok ? (data.answer ?? "No response.")
                     : (data.message ?? "The assistant hit an error. Please try again."));
      }

      setChatHistory(prev => [...prev, { role: "assistant", content: answer }]);
      saveChatMessage("assistant", answer);
    } finally {
      setChatLoading(false);
      requestAnimationFrame(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  async function handleReanalyse() {
    if (!contractId || reanalysing) return;
    setReanalysing(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/reanalyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: liveText() }),
      });
      const data = await res.json();
      if (rateLimitNote(res, data)) return;
      if (!res.ok) {
        setComputeError(data.message ?? "Couldn't re-run the analysis. Please try again.");
        return;
      }
      if (data.clauses) {
        setClauses(data.clauses);
        setFixedCount(0);
        setActiveCardId(null);
      }
    } finally {
      setReanalysing(false);
    }
  }

  async function handleSelectionRefine() {
    if (!selectionToolbar || !selectionRefineNote.trim()) return;
    setSelectionRefineLoading(true);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passage: selectionToolbar.text,
          currentSuggestion: selectionToolbar.text,
          userNote: selectionRefineNote.trim(),
          contractText: liveText(),
        }),
      });
      const data = await res.json();
      if (rateLimitNote(res, data)) return;
      if (!res.ok) {
        setComputeError(data.message ?? "Couldn't refine that selection. Please try again.");
        return;
      }
      if (data.refined) {
        const quill = quillRef.current;
        const text  = quill?.getText() ?? "";
        const idx   = text.indexOf(selectionToolbar.text);
        if (quill && idx !== -1) {
          quill.deleteText(idx, selectionToolbar.text.length);
          quill.insertText(idx, data.refined, { background: "#bbf7d0" });
          if (contractId) contractStore.updateDelta(contractId, quill.getContents());
        }
        setSelectionToolbar(null);
        setSelectionRefineOpen(false);
        setSelectionRefineNote("");
      }
    } finally {
      setSelectionRefineLoading(false);
    }
  }

  // Auto-dismiss the rate-limit toast.
  useEffect(() => {
    if (!computeError) return;
    const t = setTimeout(() => setComputeError(null), 7000);
    return () => clearTimeout(t);
  }, [computeError]);

  // noData only when there's no in-memory/localStorage result AND no contractId to fetch from Supabase
  const noData = !result && !contractId;
  const activeClause = clauses.find(c => c.id === activeCardId);

  return (
    // h-[calc(100vh-4rem)]: full viewport minus the 64px Navbar above
    // overflow-hidden: prevents page-level scroll so inner panels scroll independently
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {computeError && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
          {computeError}
        </div>
      )}
      {/* Sub-header */}
      <header className="shrink-0 border-b bg-background/80">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
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
            <Button variant="outline" onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
      ) : activeTab !== "Review" ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Sparkles className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold">{activeTab} — Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                This feature is on the roadmap and will be available in a future release.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab("Review")}>
              Back to Review
            </Button>
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
            <div className="flex-1 relative overflow-hidden">
              <div ref={containerRef} className="h-full flex flex-col overflow-hidden quill-host" />
              {dbLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading contract…
                  </div>
                </div>
              )}

              {/* Floating selection toolbar */}
              {selectionToolbar && (
                <div
                  className="absolute z-50 flex flex-col items-center"
                  style={{ top: selectionToolbar.top, left: selectionToolbar.left, transform: "translate(-50%, -100%)" }}
                  onMouseDown={e => e.preventDefault()}
                >
                  {!selectionRefineOpen ? (
                    <div className="flex items-center gap-1 rounded-lg border bg-background shadow-lg px-2 py-1.5">
                      <button
                        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        onClick={() => {
                          setSidePanel("chat");
                          setChatInput(`"${selectionToolbar.text.slice(0, 120)}${selectionToolbar.text.length > 120 ? "…" : ""}" — explain any legal risks in this passage.`);
                          setSelectionToolbar(null);
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        Ask AI
                      </button>
                      <div className="w-px h-4 bg-border" />
                      <button
                        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        onClick={() => setSelectionRefineOpen(true)}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        Refine
                      </button>
                    </div>
                  ) : (
                    <div className="w-72 rounded-lg border bg-background shadow-lg p-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Refine selected text</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 italic">
                        &ldquo;{selectionToolbar.text.slice(0, 100)}{selectionToolbar.text.length > 100 ? "…" : ""}&rdquo;
                      </p>
                      <textarea
                        autoFocus
                        rows={2}
                        placeholder="e.g. make it more founder-friendly, EU jurisdiction…"
                        className="w-full rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        value={selectionRefineNote}
                        onChange={e => setSelectionRefineNote(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSelectionRefine(); }
                          if (e.key === "Escape") { setSelectionToolbar(null); setSelectionRefineOpen(false); }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-7 text-xs gap-1"
                          disabled={selectionRefineLoading || !selectionRefineNote.trim()}
                          onClick={handleSelectionRefine}
                        >
                          {selectionRefineLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {selectionRefineLoading ? "Refining…" : "Apply"}
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs px-2"
                          onClick={() => { setSelectionToolbar(null); setSelectionRefineOpen(false); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {/* Arrow pointing down toward the selection */}
                  <div className="w-2.5 h-2.5 rotate-45 border-b border-r bg-background -mt-[5px] border-border shadow-sm" />
                </div>
              )}
            </div>
          </div>

          {/* Right: AI panel */}
          <aside className="w-[400px] border-l flex flex-col bg-muted/20 overflow-hidden">

            {/* Panel header + tab toggle */}
            <div className="px-5 py-3 border-b bg-background shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold">AI Analysis</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {clauses.length} {clauses.length === 1 ? "issue" : "issues"} remaining
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(["high", "medium", "low"] as Risk[]).map(r => {
                    const count = clauses.filter(c => c.type === r).length;
                    if (count === 0) return null;
                    return (
                      <span key={r} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_STYLES[r].badge}`}>
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
              {/* Tab toggle */}
              <div className="flex rounded-md border bg-muted/40 p-0.5 gap-0.5">
                {(["issues", "chat"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSidePanel(tab)}
                    className={`flex-1 rounded py-1 text-xs font-semibold transition-colors capitalize ${
                      sidePanel === tab
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "issues" ? "Issues" : "Ask AI"}
                  </button>
                ))}
              </div>
            </div>

            {/* Issues panel */}
            {sidePanel === "issues" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {clauses.length === 0 && (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    All issues resolved.
                  </div>
                )}
                {contractId && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-xs"
                    size="sm"
                    disabled={reanalysing}
                    onClick={handleReanalyse}
                  >
                    {reanalysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {reanalysing ? "Analysing…" : "Re-analyse document"}
                  </Button>
                )}

                {/* + Add issue — record a clause the AI missed */}
                <Button
                  variant="outline"
                  className="w-full gap-2 text-xs"
                  size="sm"
                  onClick={() => { setAddingIssue(v => !v); setAddForm(emptyAddForm); }}
                >
                  {addingIssue ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {addingIssue ? "Cancel" : "Add issue"}
                </Button>

                {addingIssue && (
                  <div className="rounded-lg border bg-card shadow-sm p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Add a missed issue
                    </p>
                    <textarea
                      rows={2}
                      placeholder="Passage — paste the exact text from the document"
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addForm.passage}
                      onChange={e => setAddForm(f => ({ ...f, passage: e.target.value }))}
                    />
                    <input
                      placeholder="Clause title — e.g. Clause 7: Indemnification"
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addForm.clause}
                      onChange={e => setAddForm(f => ({ ...f, clause: e.target.value }))}
                    />
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addForm.type}
                      onChange={e => setAddForm(f => ({ ...f, type: e.target.value as Risk }))}
                    >
                      <option value="high">High risk</option>
                      <option value="medium">Medium risk</option>
                      <option value="low">Low risk</option>
                    </select>
                    <input
                      placeholder="Issue — what is legally problematic"
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addForm.issue}
                      onChange={e => setAddForm(f => ({ ...f, issue: e.target.value }))}
                    />
                    <textarea
                      rows={2}
                      placeholder="Suggested replacement clause"
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addForm.suggestion}
                      onChange={e => setAddForm(f => ({ ...f, suggestion: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 text-xs h-7 gap-1"
                        disabled={
                          addLoading ||
                          !addForm.passage.trim() || !addForm.clause.trim() ||
                          !addForm.issue.trim() || !addForm.suggestion.trim()
                        }
                        onClick={handleAddIssue}
                      >
                        {addLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        {addLoading ? "Adding…" : "Add issue"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2"
                        onClick={() => { setAddingIssue(false); setAddForm(emptyAddForm); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {clauses.map(card => {
                  const style    = RISK_STYLES[card.type as Risk];
                  const isActive = card.id === activeCardId;
                  const isRefining = refiningId === card.id;

                  return (
                    <div
                      key={card.id}
                      onClick={() => { if (!isRefining) setActiveCardId(isActive ? null : card.id); }}
                      className={`rounded-lg border border-l-4 bg-card shadow-sm cursor-pointer transition-shadow ${style.border} ${
                        isActive ? "ring-2 ring-primary/30 shadow-md" : "hover:shadow-md"
                      }`}
                    >
                      <div className="px-4 pt-4 pb-3">
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                          {style.label}
                        </span>
                        {card.source === "user" && (
                          <span className="ml-1.5 rounded border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                            Added by you
                          </span>
                        )}
                        <h4 className={`text-sm font-semibold mt-2 mb-1 ${style.title}`}>{card.clause}</h4>
                        <p className="text-xs text-muted-foreground mb-2">{card.issue}</p>

                        <div className="rounded-md bg-muted/50 border px-3 py-2.5 mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Recommended Clause
                          </p>
                          <p className="text-xs text-foreground leading-5">{card.suggestion}</p>
                        </div>

                        {/* Refine input — shown when refine is open for this card */}
                        {isRefining && (
                          <div className="mb-3" onClick={e => e.stopPropagation()}>
                            <textarea
                              autoFocus
                              rows={2}
                              placeholder="e.g. we're a UK company, make it more founder-friendly…"
                              className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              value={refineNote}
                              onChange={e => setRefineNote(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleRefine(card);
                                }
                                if (e.key === "Escape") { setRefiningId(null); setRefineNote(""); }
                              }}
                            />
                            <div className="flex gap-2 mt-1.5">
                              <Button
                                size="sm"
                                className="flex-1 text-xs h-7 gap-1"
                                disabled={refineLoading || !refineNote.trim()}
                                onClick={e => { e.stopPropagation(); handleRefine(card); }}
                              >
                                {refineLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                {refineLoading ? "Refining…" : "Refine"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 px-2"
                                onClick={e => { e.stopPropagation(); setRefiningId(null); setRefineNote(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

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
                            variant={isRefining ? "secondary" : "default"}
                            className="flex-1 text-xs h-8 gap-1"
                            onClick={e => {
                              e.stopPropagation();
                              if (isRefining) { setRefiningId(null); setRefineNote(""); }
                              else { setRefiningId(card.id); setRefineNote(""); }
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {isRefining ? "Cancel" : "Refine"}
                          </Button>
                        </div>

                        {/* Not an issue — dismiss a false positive */}
                        {dismissingId === card.id ? (
                          <div className="mt-2" onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              placeholder="Why isn't this an issue? (optional)"
                              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              value={dismissReason}
                              onChange={e => setDismissReason(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); handleDismiss(card, dismissReason.trim()); }
                                if (e.key === "Escape") { setDismissingId(null); setDismissReason(""); }
                              }}
                            />
                            <div className="flex gap-2 mt-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-7 gap-1"
                                onClick={e => { e.stopPropagation(); handleDismiss(card, dismissReason.trim()); }}
                              >
                                Confirm — not an issue
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 px-2"
                                onClick={e => { e.stopPropagation(); setDismissingId(null); setDismissReason(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                            onClick={e => {
                              e.stopPropagation();
                              setDismissingId(card.id);
                              setDismissReason("");
                              setRefiningId(null);
                            }}
                          >
                            <X className="h-3 w-3" />
                            Not an issue
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Dismissed clauses — collapsed by default */}
                {dismissedClauses.length > 0 && (
                  <div className="pt-2 border-t">
                    <button
                      className="flex w-full items-center justify-between py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowDismissed(v => !v)}
                    >
                      <span>Dismissed ({dismissedClauses.length})</span>
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showDismissed ? "rotate-90" : ""}`} />
                    </button>
                    {showDismissed && (
                      <div className="mt-2 space-y-2">
                        {dismissedClauses.map(card => (
                          <div key={card.id} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-muted-foreground line-through">{card.clause}</p>
                              {card.source === "user" && (
                                <span className="shrink-0 rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700">
                                  Yours
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{card.issue}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-1.5 h-6 text-[11px] px-2"
                              onClick={() => handleRestore(card)}
                            >
                              Restore
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Ask AI chat panel */}
            {sidePanel === "chat" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                      <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">Ask anything about this contract.</p>
                      <p className="text-[11px] text-muted-foreground/60">e.g. &ldquo;What are my termination rights?&rdquo; or &ldquo;Is this auto-renewal clause standard?&rdquo;</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-5 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border text-foreground"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-background border rounded-xl px-3 py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat input */}
                <div className="shrink-0 border-t bg-background px-3 py-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      placeholder="Ask about this contract…"
                      className="flex-1 rounded-md border bg-muted/30 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleChat();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={chatLoading || !chatInput.trim()}
                      onClick={handleChat}
                    >
                      {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
