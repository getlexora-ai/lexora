"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { topicLabel } from "@/lib/clause-taxonomy";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import type { ClauseRow } from "@/components/clauses/clause-dialog";

/**
 * Pick a clause from the library. Used by the review screen ("Insert from
 * library") and the playbook rule editor (preferred clause). Filters by a topic
 * hint if given; toggles lexical ↔ semantic search.
 */
export function ClausePicker({
  open,
  onClose,
  clauseTypeHint,
  onPick,
  title = "Insert from library",
}: {
  open: boolean;
  onClose: () => void;
  clauseTypeHint?: string;
  onPick: (clause: ClauseRow) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [rows, setRows] = useState<ClauseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (semantic && q.trim()) {
        const res = await fetch("/api/clause-library/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q.trim(), type: clauseTypeHint || undefined }),
        });
        const data = await res.json();
        setRows(data.hits ?? []);
        return;
      }
      const sp = new URLSearchParams();
      if (clauseTypeHint) sp.set("type", clauseTypeHint);
      if (q.trim()) sp.set("q", q.trim());
      sp.set("limit", "30");
      const res = await fetch(`/api/clause-library?${sp.toString()}`);
      const data = await res.json();
      setRows(data.clauses ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, semantic, clauseTypeHint]);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(), 200);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [open, load]);

  useEffect(() => { if (!open) { setQ(""); setRows([]); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {clauseTypeHint
              ? `Filtered to ${topicLabel(clauseTypeHint)}. Pick a clause to use its wording.`
              : "Pick a clause to use its wording."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
            <Search className="size-3.5 text-text-3" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm focus:outline-none"
              placeholder={semantic ? "Describe the clause…" : "Search wording…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="seg-btn"
            data-on={semantic}
            aria-pressed={semantic}
            onClick={() => setSemantic((v) => !v)}
          >
            <Sparkles className="mr-1 inline size-3.5" /> Semantic
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pt-1">
          {loading && rows.length === 0 ? (
            <div className="py-8 text-center"><Loader2 className="mx-auto size-4 animate-spin text-text-3" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-3">No clauses found.</p>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onPick(r); onClose(); }}
                className="flex w-full flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold">{r.title}</span>
                  <ApprovalBadge approved={r.is_approved} className="ml-auto shrink-0" />
                </span>
                <span className="flex items-center gap-2 text-[11px] text-text-3">
                  <span>{topicLabel(r.clause_type)}</span>
                  {r.reference && <span className="font-mono">{r.reference}</span>}
                </span>
                <span className="line-clamp-2 text-[12px] leading-[1.5] text-text-2">{r.content}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
