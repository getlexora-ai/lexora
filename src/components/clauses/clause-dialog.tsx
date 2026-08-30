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
import { ApprovalBadge } from "@/components/clauses/approval-badge";

export type ClauseRow = {
  id: string;
  title: string;
  content: string;
  content_en: string | null;
  summary: string | null;
  clause_type: string;
  reference: string | null;
  posture: "preferred" | "fallback" | "walk_away";
  tags: string[];
  source: "curated" | "user" | "imported";
  is_approved: boolean;
  readonly?: boolean;
  updated_at: string;
};

const POSTURES: ClauseRow["posture"][] = ["preferred", "fallback", "walk_away"];
const POSTURE_LABEL: Record<ClauseRow["posture"], string> = {
  preferred: "Preferred — our default ask",
  fallback: "Fallback — acceptable compromise",
  walk_away: "Walk-away — do not accept",
};

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Props = {
  open: boolean;
  onClose: () => void;
  /** null → create mode */
  clause: ClauseRow | null;
  onSaved: (c: ClauseRow) => void;
  onDeleted: (id: string) => void;
};

export function ClauseDialog({ open, onClose, clause, onSaved, onDeleted }: Props) {
  const editing = clause != null;
  const readOnly = !!clause?.readonly;

  const [title, setTitle] = useState("");
  const [clauseType, setClauseType] = useState("kaution");
  const [posture, setPosture] = useState<ClauseRow["posture"]>("preferred");
  const [reference, setReference] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setTitle(clause?.title ?? "");
    setClauseType(clause?.clause_type ?? "kaution");
    setPosture(clause?.posture ?? "preferred");
    setReference(clause?.reference ?? "");
    setSummary(clause?.summary ?? "");
    setTags((clause?.tags ?? []).join(", "));
    setContent(clause?.content ?? "");
    setContentEn(clause?.content_en ?? "");
  }, [open, clause]);

  const canSave = title.trim() && content.trim() && clauseType && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setErr(null);
    const payload = {
      title: title.trim(),
      clause_type: clauseType,
      posture,
      reference: reference.trim() || null,
      summary: summary.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      content: content.trim(),
      content_en: contentEn.trim() || null,
    };
    try {
      const res = await fetch(
        editing ? `/api/clause-library/${clause!.id}` : "/api/clause-library",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data.clause);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleApproved(next: boolean) {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clause-library/${clause!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_approved: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      onSaved(data.clause);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clause-library/${clause!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(clause!.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {readOnly ? "Clause" : editing ? "Edit clause" : "New clause"}
            {clause && <ApprovalBadge approved={clause.is_approved} />}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "A system-curated clause. Copy the wording into a contract from the review screen."
              : "Reusable wording, grounded in German law. It is not reviewed by a lawyer until you say so."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <input className={field} value={title} disabled={readOnly}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kaution (§ 551 BGB)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Topic</label>
              <Select value={clauseType} onValueChange={(v) => setClauseType(v ?? "kaution")} disabled={readOnly}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAUSE_TOPICS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{topicLabel(t.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Posture</label>
              <Select value={posture} onValueChange={(v) => setPosture((v as ClauseRow["posture"]) ?? "preferred")} disabled={readOnly}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSTURES.map((p) => (
                    <SelectItem key={p} value={p}>{POSTURE_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Statute reference <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input className={field} value={reference} disabled={readOnly}
                onChange={(e) => setReference(e.target.value)} placeholder="§ 551 Abs. 1 BGB" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags <span className="font-normal text-muted-foreground">(comma-separated)</span></label>
              <input className={field} value={tags} disabled={readOnly}
                onChange={(e) => setTags(e.target.value)} placeholder="kaution, sicherheit" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Summary <span className="font-normal text-muted-foreground">(one line)</span></label>
            <input className={field} value={summary} disabled={readOnly}
              onChange={(e) => setSummary(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Clause text (German — authoritative)</label>
            <textarea className={field + " min-h-[140px] resize-y font-[450] leading-relaxed"} value={content}
              disabled={readOnly} onChange={(e) => setContent(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">English mirror <span className="font-normal text-muted-foreground">(optional — keep German citations verbatim)</span></label>
            <textarea className={field + " min-h-[90px] resize-y leading-relaxed"} value={contentEn}
              disabled={readOnly} onChange={(e) => setContentEn(e.target.value)} />
          </div>

          {editing && !readOnly && (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={clause!.is_approved} disabled={busy}
                onChange={(e) => toggleApproved(e.target.checked)} />
              I have had this clause reviewed by a licensed lawyer (Rechtsanwältin/Rechtsanwalt).
            </label>
          )}

          {err && <p className="text-sm text-risk-high">{err}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
          {editing && !readOnly ? (
            <Button variant="ghost" size="sm" onClick={remove} disabled={busy}
              className="text-risk-high hover:text-risk-high">
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
            {!readOnly && (
              <Button onClick={save} disabled={!canSave}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : editing ? "Save" : "Create"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
