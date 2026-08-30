"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CLAUSE_TOPICS, topicLabel } from "@/lib/clause-taxonomy";
import { PreferredClausePicker } from "./preferred-clause-picker";
import { SEVERITIES, type PlaybookRule } from "./types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Draft = Partial<PlaybookRule>;

/**
 * Edit a single playbook rule. `rule === null` is create mode. Long-text fields
 * (acceptable / fallback / unacceptable / rationale) live here rather than in
 * the table row.
 */
export function RuleDrawer({
  open,
  onClose,
  playbookId,
  rule,
  readOnly,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  playbookId: string;
  rule: PlaybookRule | null;
  readOnly?: boolean;
  onSaved: (rule: PlaybookRule) => void;
  onDeleted: (id: string) => void;
}) {
  const editing = rule != null;
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      rule
        ? { ...rule }
        : {
            clause_type: "sonstiges",
            topic: "",
            acceptable: "",
            fallback: "",
            unacceptable: "",
            rationale: "",
            reference: "",
            severity: "medium",
            is_required: false,
            preferred_clause_id: null,
          },
    );
  }, [open, rule]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        clause_type: draft.clause_type,
        topic: draft.topic || topicLabel(draft.clause_type ?? "sonstiges"),
        acceptable: draft.acceptable ?? "",
        fallback: draft.fallback ?? "",
        unacceptable: draft.unacceptable ?? "",
        rationale: draft.rationale ?? "",
        reference: draft.reference ?? "",
        severity: draft.severity ?? "medium",
        is_required: !!draft.is_required,
        preferred_clause_id: draft.preferred_clause_id ?? null,
      };
      const url = editing
        ? `/api/playbooks/${playbookId}/rules/${rule!.id}`
        : `/api/playbooks/${playbookId}/rules`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data.rule);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!rule) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/playbooks/${playbookId}/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(rule.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            One review position for a clause topic. Lexora applies it mechanically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-medium">
              Topic
              <Select
                value={draft.clause_type ?? "sonstiges"}
                onValueChange={(v) => v && set("clause_type", v)}
              >
                <SelectTrigger disabled={readOnly}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUSE_TOPICS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {topicLabel(t.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium">
              Severity
              <Select
                value={draft.severity ?? "medium"}
                onValueChange={(v) => v && set("severity", v as PlaybookRule["severity"])}
              >
                <SelectTrigger disabled={readOnly}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Label
            <input
              className={field}
              value={draft.topic ?? ""}
              disabled={readOnly}
              placeholder={topicLabel(draft.clause_type ?? "sonstiges")}
              onChange={(e) => set("topic", e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] font-medium">
            <input
              type="checkbox"
              checked={!!draft.is_required}
              disabled={readOnly}
              onChange={(e) => set("is_required", e.target.checked)}
            />
            Required — the contract is incomplete without this topic
          </label>

          {(["acceptable", "fallback", "unacceptable", "rationale"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-[12px] font-medium capitalize">
              {k}
              {k === "acceptable" && " — our default-OK position"}
              {k === "unacceptable" && " — must be flagged (redline)"}
              <textarea
                className={field}
                rows={k === "rationale" ? 2 : 3}
                value={(draft[k] as string) ?? ""}
                disabled={readOnly}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}

          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Reference (German norm)
            <input
              className={field}
              value={draft.reference ?? ""}
              disabled={readOnly}
              placeholder="§ 551 Abs. 1 BGB"
              onChange={(e) => set("reference", e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1 text-[12px] font-medium">
            Preferred clause (fixes a redline)
            <PreferredClausePicker
              topic={draft.clause_type ?? "sonstiges"}
              value={draft.preferred_clause_id ?? null}
              disabled={readOnly}
              onChange={(id) => set("preferred_clause_id", id)}
            />
          </div>

          {error && <p className="text-[12px] text-[color:var(--high)]">{error}</p>}
        </div>

        {!readOnly && (
          <div className="mt-4 flex items-center justify-between">
            {editing ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Add rule"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
