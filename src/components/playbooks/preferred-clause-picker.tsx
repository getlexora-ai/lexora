"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { topicLabel } from "@/lib/clause-taxonomy";

type LibClause = {
  id: string;
  title: string;
  summary: string | null;
  reference: string | null;
  clause_type: string;
  is_approved: boolean;
};

/**
 * Inline control + Dialog picker for a rule's preferred library clause. Lists
 * GET /api/clause-library filtered to the rule's topic; returns the chosen id.
 */
export function PreferredClausePicker({
  topic,
  value,
  disabled,
  onChange,
}: {
  topic: string;
  value: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LibClause[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<LibClause | null>(null);

  // Resolve the label for an already-set value.
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setCurrent(null);
      return;
    }
    fetch(`/api/clause-library/${value}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setCurrent(d?.clause ?? null))
      .catch(() => !cancelled && setCurrent(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (topic) sp.set("type", topic);
      sp.set("limit", "50");
      const res = await fetch(`/api/clause-library?${sp.toString()}`);
      const d = await res.json();
      setRows(d.clauses ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [topic]);

  useEffect(() => {
    if (open) void loadRows();
  }, [open, loadRows]);

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        {current ? (
          <span className="truncate">{current.title}</span>
        ) : value ? (
          <span className="text-text-3">Clause {value.slice(0, 8)}…</span>
        ) : (
          <span className="text-text-3">None set for {topicLabel(topic)}</span>
        )}
      </div>
      {value && !disabled && (
        <Button type="button" size="xs" variant="ghost" onClick={() => onChange(null)}>
          <X className="size-3" />
        </Button>
      )}
      {!disabled && (
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Choose
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preferred clause: {topicLabel(topic)}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="py-8 text-center text-text-3">
              <Loader2 className="mx-auto size-4 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-3">
              No library clauses for this topic yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-1 py-2.5 text-left hover:bg-surface-2"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className="text-[13px] font-medium">{c.title}</span>
                    {c.summary && (
                      <span className="text-[12px] text-text-3">{c.summary}</span>
                    )}
                    {c.reference && (
                      <span className="font-mono text-[11px] text-text-3">{c.reference}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
