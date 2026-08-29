"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ChevronRight, Sparkles, Send, Loader2, MessageSquare,
  Plus, X, Check, FileText, LayoutGrid, BookOpen, BarChart3, Settings,
  Undo2, Wand2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RdgStrip } from "@/components/rdg-notice";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { analysisStore, RiskClause } from "@/lib/analysis-store";
import { contractStore } from "@/lib/contract-store";
import { cn } from "@/lib/utils";
import { looksLikeMarkdown, markdownToHtml, stripPageSeparators } from "@/lib/markdown";

/* Load contract text into Quill. Generated drafts / AI edits arrive as Markdown
   and are rendered as real headings/bold/lists; plain extracted text (uploads)
   is inserted as-is, only stripped of LLMWhisperer's `<<<` page markers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setDocText(quill: any, text: string) {
  if (looksLikeMarkdown(text)) {
    quill.setContents(quill.clipboard.convert({ html: markdownToHtml(text) }));
  } else {
    quill.setText(stripPageSeparators(text));
  }
}

type Risk = "high" | "medium" | "low";

/* Risk presentation. One pill object shared with the dashboard and the landing
   demo, so a risk badge means the same thing wherever it appears. The left
   border on a card is the same hue at full strength — the card's own severity
   rail, echoing the tinted rail beside a flagged clause in the document. */
const RISK_STYLES: Record<Risk, { rail: string; pill: string; label: string }> = {
  high:   { rail: "border-l-risk-high",   pill: "pill-high", label: "High" },
  medium: { rail: "border-l-risk-medium", pill: "pill-med",  label: "Medium" },
  low:    { rail: "border-l-risk-low",    pill: "pill-low",  label: "Low" },
};

/* The left icon rail. Only Contracts leads anywhere today; the rest are the
   shape of the workspace, marked as such rather than dead-linked. */
const RAIL = [
  { icon: LayoutGrid, label: "Home", href: "/dashboard" },
  { icon: FileText, label: "Contracts", href: "/dashboard", on: true },
  { icon: BookOpen, label: "Clause library" },
  { icon: BarChart3, label: "Risk dashboard" },
];

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
            setDocText(quill, dbContent.text);
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
        setDocText(quill, pending.text);
        pendingDbContent.current = null;
      } else if (diskResult?.delta) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quill.setContents(diskResult.delta as any);
      } else if (result?.extractedText) {
        setDocText(quill, result.extractedText);
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
    quill.formatText(match.start, length, { background: "var(--mark-focus)" }, "silent");
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
      quill.insertText(match.start, card.suggestion, { background: "var(--mark-applied)" });
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
          setDocText(quillRef.current, data.updatedDocument);
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
          quill.insertText(idx, data.refined, { background: "var(--mark-applied)" });
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


  /* Risk counts for the chrome bar, from the clauses still pending. */
  const riskCounts = (["high", "medium", "low"] as Risk[]).map(r => ({
    r,
    n: clauses.filter(c => c.type === r).length,
  }));

  /* The composer is shared by both panel tabs. Sending from the Review tab
     switches to Ask AI first, so the answer is never written somewhere the
     reader cannot see it. handleChat itself is untouched. */
  function sendFromComposer() {
    if (!chatInput.trim() || chatLoading) return;
    setSidePanel("chat");
    handleChat();
  }

  return (
    // h-dvh + overflow-hidden: the page itself never scrolls, so the document
    // pane and the review panel scroll independently.
    <div className="grid h-dvh grid-rows-[auto_auto_1fr] overflow-hidden">
      {computeError && (
        <div className="fixed right-5 bottom-5 z-50 max-w-sm rounded-xl border border-risk-medium-line bg-risk-medium-soft px-4 py-3 text-[13px] text-foreground shadow-e3">
          {computeError}
        </div>
      )}

      {/* ══════════ chrome ══════════ */}
      <header className="flex h-13 items-center gap-2.5 border-b border-border bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] px-3.5 backdrop-blur-md">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Back to dashboard"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="size-3.5" />
        </Button>

        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
          <span className="truncate">{fileName}</span>
          {contractType && (
            <span className="pill pill-none max-[680px]:hidden">
              <i />
              {contractType}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-normal text-text-2 max-[680px]:hidden">
            <span className="size-1.5 rounded-full bg-risk-medium" aria-hidden />
            In review
          </span>
        </div>

        <span className="flex-1" />

        {/* Live risk tally — the one number a reviewer wants without scrolling. */}
        <div className="flex gap-1.5 max-[900px]:hidden">
          {riskCounts.filter(({ n }) => n > 0).map(({ r, n }) => (
            <span key={r} className={cn("pill", RISK_STYLES[r].pill)}>
              <i />
              {n} {RISK_STYLES[r].label}
            </span>
          ))}
          {fixedCount > 0 && (
            <span className="pill pill-low">
              <i />
              {fixedCount} applied
            </span>
          )}
        </div>

        <div className="seg max-[1180px]:hidden" role="tablist" aria-label="Document view">
          {NAV_TABS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className="seg-btn"
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <Button size="sm" variant="outline">
          Export
        </Button>
      </header>

      {/* Slim standing disclaimer, directly under the toolbar. */}
      <RdgStrip />

      {noData ? (
        <main className="flex items-center justify-center">
          <div className="space-y-3 text-center">
            <p className="text-[13px] text-text-3">No analysis data found.</p>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </Button>
          </div>
        </main>
      ) : activeTab !== "Review" ? (
        <main className="flex items-center justify-center">
          <div className="space-y-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-surface-2">
              <Sparkles className="size-5 text-text-3" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[15px] font-semibold">{activeTab} — coming soon</h3>
              <p className="max-w-xs text-[13px] text-text-2">
                This part of the workspace is on the roadmap.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab("Review")}>
              Back to Review
            </Button>
          </div>
        </main>
      ) : (
        <div className="grid min-h-0 grid-cols-1 min-[720px]:grid-cols-[52px_1fr] min-[1060px]:grid-cols-[52px_1fr_384px]">
          {/* ══════════ left rail ══════════ */}
          <nav className="hidden flex-col items-center gap-1 border-r border-border bg-surface-2 py-2.5 min-[720px]:flex">
            <BrandMark size={26} className="mb-1.5" />
            {RAIL.map(({ icon: Icon, label, href, on }) => {
              const classes = cn(
                "grid size-8.5 place-items-center rounded-md transition-colors",
                on
                  ? "border border-border bg-surface text-foreground shadow-e1"
                  : "text-text-3 hover:bg-surface-3 hover:text-foreground"
              );
              return href ? (
                <Link key={label} href={href} aria-label={label} className={classes}>
                  <Icon className="size-4" aria-hidden />
                </Link>
              ) : (
                <span
                  key={label}
                  aria-label={`${label} — coming soon`}
                  aria-disabled
                  className={cn(classes, "cursor-not-allowed opacity-60")}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              );
            })}
            <span className="flex-1" />
            <span
              aria-label="Settings — coming soon"
              aria-disabled
              className="grid size-8.5 cursor-not-allowed place-items-center rounded-md text-text-3 opacity-60"
            >
              <Settings className="size-4" aria-hidden />
            </span>
          </nav>

          {/* ══════════ document ══════════ */}
          <div className="flex min-w-0 flex-col overflow-hidden">
            {activeClause && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-risk-medium-soft px-4 py-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-risk-medium" aria-hidden />
                <span className="text-[11.5px] text-text-2">
                  Clause highlighted in the document — hit{" "}
                  <b className="font-semibold text-foreground">Apply fix</b>{" "}
                  on the card to swap in the suggested wording.
                </span>
              </div>
            )}

            {/* Quill mounts here — toolbar is injected above the ql-editor div */}
            <div className="relative flex-1 overflow-hidden">
              <div ref={containerRef} className="quill-host flex h-full flex-col overflow-hidden" />
              {dbLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_oklab,var(--bg)_60%,transparent)] backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-[13px] text-text-2">
                    <Loader2 className="size-4 animate-spin" />
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
                    <div className="flex items-center gap-0.5 rounded-md border border-border-strong bg-surface p-[3px] shadow-e3">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2"
                        onClick={() => {
                          setSidePanel("chat");
                          setChatInput(`"${selectionToolbar.text.slice(0, 120)}${selectionToolbar.text.length > 120 ? "…" : ""}" — explain any legal risks in this passage.`);
                          setSelectionToolbar(null);
                        }}
                      >
                        <MessageSquare className="size-3.5" />
                        Ask AI
                      </button>
                      <span className="h-4 w-px bg-border" aria-hidden />
                      <button
                        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2"
                        onClick={() => setSelectionRefineOpen(true)}
                      >
                        <Wand2 className="size-3.5" />
                        Refine
                      </button>
                    </div>
                  ) : (
                    <div className="w-72 space-y-2 rounded-lg border border-border-strong bg-surface p-3 shadow-e3">
                      <p className="eyebrow">Refine selected text</p>
                      <p className="line-clamp-2 text-xs text-text-3 italic">
                        &ldquo;{selectionToolbar.text.slice(0, 100)}{selectionToolbar.text.length > 100 ? "…" : ""}&rdquo;
                      </p>
                      <textarea
                        autoFocus
                        rows={2}
                        placeholder="e.g. make it more founder-friendly, EU jurisdiction…"
                        className="w-full resize-none rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-e-inset focus-visible:outline-none"
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
                          className="flex-1"
                          disabled={selectionRefineLoading || !selectionRefineNote.trim()}
                          onClick={handleSelectionRefine}
                        >
                          {selectionRefineLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          {selectionRefineLoading ? "Refining…" : "Apply"}
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setSelectionToolbar(null); setSelectionRefineOpen(false); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {/* Arrow pointing down toward the selection */}
                  <span
                    className="-mt-[5px] size-2.5 rotate-45 border-r border-b border-border-strong bg-surface"
                    aria-hidden
                  />
                </div>
              )}
            </div>
          </div>

          {/* ══════════ AI review panel ══════════ */}
          <aside className="flex min-h-0 flex-col border-border bg-surface-2 max-[1059px]:col-span-full max-[1059px]:max-h-[62vh] max-[1059px]:border-t min-[1060px]:border-l">
            {/* Panel head */}
            <div className="flex shrink-0 flex-col gap-2.5 border-b border-border px-3.5 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13.5px] font-semibold">AI review</h2>
                <span className="ml-auto font-mono text-[11px] text-text-3">
                  {clauses.length} {clauses.length === 1 ? "issue" : "issues"}
                  {riskCounts[0].n > 0 && ` · ${riskCounts[0].n} high`}
                </span>
              </div>

              <div className="seg" role="tablist" aria-label="Review panel">
                {([
                  ["issues", "Review"],
                  ["chat", "Ask AI"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={sidePanel === key}
                    className="seg-btn flex-1"
                    onClick={() => setSidePanel(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sidePanel === "issues" && (
                <div className="flex gap-1.5">
                  {contractId && (
                    <Button size="sm" disabled={reanalysing} onClick={handleReanalyse}>
                      {reanalysing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      {reanalysing ? "Analysing…" : "Re-analyse"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAddingIssue(v => !v); setAddForm(emptyAddForm); }}
                  >
                    {addingIssue ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                    {addingIssue ? "Cancel" : "Add issue"}
                  </Button>
                </div>
              )}
            </div>

            {/* ── Issues ── */}
            {sidePanel === "issues" && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                {addingIssue && (
                  <div className="shrink-0 space-y-2 rounded-lg border border-border bg-surface p-3 shadow-e-inset">
                    <p className="eyebrow">Add a missed issue</p>
                    <textarea
                      rows={2}
                      placeholder="Passage — paste the exact text from the document"
                      className="w-full resize-none rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                      value={addForm.passage}
                      onChange={e => setAddForm(f => ({ ...f, passage: e.target.value }))}
                    />
                    <input
                      placeholder="Clause title — e.g. Clause 7: Indemnification"
                      className="w-full rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                      value={addForm.clause}
                      onChange={e => setAddForm(f => ({ ...f, clause: e.target.value }))}
                    />
                    <select
                      aria-label="Risk level"
                      className="w-full rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                      value={addForm.type}
                      onChange={e => setAddForm(f => ({ ...f, type: e.target.value as Risk }))}
                    >
                      <option value="high">High risk</option>
                      <option value="medium">Medium risk</option>
                      <option value="low">Low risk</option>
                    </select>
                    <input
                      placeholder="Issue — what is worth a closer look"
                      className="w-full rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                      value={addForm.issue}
                      onChange={e => setAddForm(f => ({ ...f, issue: e.target.value }))}
                    />
                    <textarea
                      rows={2}
                      placeholder="Suggested replacement wording"
                      className="w-full resize-none rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                      value={addForm.suggestion}
                      onChange={e => setAddForm(f => ({ ...f, suggestion: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={
                          addLoading ||
                          !addForm.passage.trim() || !addForm.clause.trim() ||
                          !addForm.issue.trim() || !addForm.suggestion.trim()
                        }
                        onClick={handleAddIssue}
                      >
                        {addLoading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                        {addLoading ? "Adding…" : "Add issue"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAddingIssue(false); setAddForm(emptyAddForm); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {clauses.length === 0 && !addingIssue && (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Check className="size-5 text-risk-low" aria-hidden />
                    <p className="text-[13px] text-text-2">Nothing left flagged.</p>
                    <p className="text-[11.5px] text-text-3">
                      Every issue has been applied or dismissed.
                    </p>
                  </div>
                )}

                {clauses.map(card => {
                  const style      = RISK_STYLES[card.type as Risk];
                  const isOpen     = card.id === activeCardId;
                  const isRefining = refiningId === card.id;

                  return (
                    <div
                      key={card.id}
                      className={cn(
                        "shrink-0 overflow-hidden rounded-lg border border-l-[3px] border-border bg-surface shadow-e-inset",
                        style.rail
                      )}
                    >
                      {/* Header — clicking it both opens the card and highlights
                          the passage in the document (one existing handler). */}
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left"
                        onClick={() => { if (!isRefining) setActiveCardId(isOpen ? null : card.id); }}
                      >
                        <span className={cn("pill shrink-0", style.pill)}>
                          <i />
                          {style.label}
                        </span>
                        <span className="truncate text-[12.5px] font-semibold">
                          {card.clause}
                        </span>
                        {card.source === "user" && (
                          <span className="shrink-0 rounded-full border border-border px-1.5 font-mono text-[9px] tracking-[0.05em] text-text-3 uppercase">
                            Added by you
                          </span>
                        )}
                        <ChevronRight
                          className={cn(
                            "ml-auto size-3.5 shrink-0 text-text-3 transition-transform",
                            isOpen && "rotate-90"
                          )}
                          aria-hidden
                        />
                      </button>

                      <p className="px-2.5 pb-2 text-xs leading-[1.55] text-text-2">
                        {card.issue}
                      </p>

                      {!isOpen && (
                        <p className="truncate px-2.5 pb-2.5 text-[11.5px] text-text-3">
                          <span className="font-medium text-text-2">Fix:</span> {card.suggestion}
                        </p>
                      )}

                      {isOpen && (
                        <div className="flex flex-col gap-2.5 border-t border-border p-2.5">
                          <div>
                            <p className="eyebrow mb-1">
                              Suggested wording — for your review
                            </p>
                            <p className="rounded-md border border-border bg-surface-2 p-2.5 text-[12.5px] leading-[1.6] text-foreground">
                              {card.suggestion}
                            </p>
                          </div>

                          {/* − old / + new, so the change is legible before it is made. */}
                          <div className="overflow-hidden rounded-md border border-border font-mono text-[11px] leading-[1.7]">
                            <div className="bg-risk-high-soft px-2.5 py-1 text-risk-high">
                              − {card.passage}
                            </div>
                            <div className="bg-risk-low-soft px-2.5 py-1 text-risk-low">
                              + {card.suggestion}
                            </div>
                          </div>

                          {isRefining && (
                            <div>
                              <textarea
                                autoFocus
                                rows={2}
                                placeholder="e.g. we're a UK company, make it more founder-friendly…"
                                className="w-full resize-none rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
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
                              <div className="mt-1.5 flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  disabled={refineLoading || !refineNote.trim()}
                                  onClick={() => handleRefine(card)}
                                >
                                  {refineLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                                  {refineLoading ? "Refining…" : "Refine"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setRefiningId(null); setRefineNote(""); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          {dismissingId === card.id && (
                            <div>
                              <input
                                autoFocus
                                placeholder="Why isn't this an issue? (optional)"
                                className="w-full rounded-md border border-border-strong bg-surface-2 px-2.5 py-2 text-xs shadow-e-inset focus-visible:outline-none"
                                value={dismissReason}
                                onChange={e => setDismissReason(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") { e.preventDefault(); handleDismiss(card, dismissReason.trim()); }
                                  if (e.key === "Escape") { setDismissingId(null); setDismissReason(""); }
                                }}
                              />
                              <div className="mt-1.5 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => handleDismiss(card, dismissReason.trim())}
                                >
                                  Confirm — not an issue
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setDismissingId(null); setDismissReason(""); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions — always visible, so a fix can be applied
                          without expanding the card. */}
                      {dismissingId !== card.id && (
                        <div className="flex gap-1.5 border-t border-border p-2.5">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleReplace(card)}
                          >
                            <Check className="size-3.5" />
                            Apply fix
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (isRefining) { setRefiningId(null); setRefineNote(""); }
                              else { setActiveCardId(card.id); setRefiningId(card.id); setRefineNote(""); }
                            }}
                          >
                            <Wand2 className="size-3.5" />
                            {isRefining ? "Cancel" : "Refine"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveCardId(card.id);
                              setDismissingId(card.id);
                              setDismissReason("");
                              setRefiningId(null);
                            }}
                          >
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Dismissed — collapsed by default */}
                {dismissedClauses.length > 0 && (
                  <div className="mt-1 shrink-0">
                    <button
                      type="button"
                      aria-expanded={showDismissed}
                      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong px-2.5 py-2.5 text-xs text-text-3 transition-colors hover:text-foreground"
                      onClick={() => setShowDismissed(v => !v)}
                    >
                      <ChevronRight
                        className={cn("size-3.5 transition-transform", showDismissed && "rotate-90")}
                        aria-hidden
                      />
                      {dismissedClauses.length} dismissed{" "}
                      {dismissedClauses.length === 1 ? "issue" : "issues"}
                    </button>

                    {showDismissed && (
                      <div className="mt-2 space-y-2">
                        {dismissedClauses.map(card => (
                          <div
                            key={card.id}
                            className="rounded-lg border border-border bg-surface px-2.5 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-text-3 line-through">
                                {card.clause}
                              </p>
                              {card.source === "user" && (
                                <span className="shrink-0 rounded-full border border-border px-1.5 font-mono text-[9px] tracking-[0.05em] text-text-3 uppercase">
                                  Yours
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-text-3">{card.issue}</p>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="mt-1.5"
                              onClick={() => handleRestore(card)}
                            >
                              <Undo2 className="size-3" />
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

            {/* ── Ask AI ── */}
            {sidePanel === "chat" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                {chatHistory.length === 0 && (
                  <div className="space-y-2 py-10 text-center">
                    <Sparkles className="mx-auto size-5 text-text-3" />
                    <p className="text-xs text-text-2">Ask anything about this contract.</p>
                    <p className="text-[11px] text-text-3">
                      e.g. &ldquo;What are my termination rights?&rdquo; or &ldquo;Is this
                      auto-renewal clause standard?&rdquo;
                    </p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5",
                        msg.role === "user"
                          ? "btn-graphite"
                          : "border border-border bg-surface text-foreground shadow-e-inset"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-e-inset">
                      <Loader2 className="size-3.5 animate-spin text-text-3" />
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            )}

            {/* Persistent composer — present on both tabs, as the artifact shows it. */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
              <input
                placeholder="Ask about this contract…"
                aria-label="Ask about this contract"
                className="h-8 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] shadow-e1 placeholder:text-text-3 focus-visible:outline-none"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendFromComposer();
                  }
                }}
              />
              <Button
                size="icon"
                aria-label="Send"
                disabled={chatLoading || !chatInput.trim()}
                onClick={sendFromComposer}
              >
                {chatLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </aside>
        </div>
      )}

      <ThemeToggle floating />
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
