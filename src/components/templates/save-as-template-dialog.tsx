"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RdgNoticeBar } from "@/components/rdg-notice";
import type { ContractTemplate } from "@/lib/contract-templates";

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Row = { literal: string; key: string; label: string; type: string };

// Regex-suggest the literal spans most likely to vary between contracts.
const PATTERNS: Array<{ re: RegExp; type: string; key: string }> = [
  { re: /\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s?(?:EUR|€)/g, type: "currency", key: "betrag" },
  { re: /\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}/g, type: "date", key: "datum" },
  { re: /\b\d{1,2}\.\s?(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s?\d{4}\b/g, type: "date", key: "datum" },
  { re: /\bDE\d{2}(?:\s?\d{4}){4}\s?\d{2}\b/g, type: "text", key: "iban" },
];

function suggestFromText(text: string): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const { re, type, key } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const literal = m[0].trim();
      if (literal.length < 3 || seen.has(literal)) continue;
      seen.add(literal);
      rows.push({ literal, key: `${key}${rows.length + 1}`, label: literal, type });
    }
  }
  return rows.slice(0, 25);
}

export function SaveAsTemplateDialog({
  open,
  onClose,
  contractId,
  contractText,
  contractType,
  defaultName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractText: string;
  contractType?: string;
  defaultName?: string;
  onSaved: (t: ContractTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<null | "suggest" | "save">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName ? `${defaultName} template` : "");
    setRows(suggestFromText(contractText));
    setError(null);
  }, [open, contractText, defaultName]);

  const preview = useMemo(() => {
    let text = contractText;
    for (const r of [...rows].filter((r) => r.literal && r.key).sort((a, b) => b.literal.length - a.literal.length)) {
      text = text.split(r.literal).join(`{{${r.key}}}`);
    }
    return text;
  }, [contractText, rows]);

  const matched = useMemo(
    () => new Set(rows.filter((r) => r.literal && contractText.includes(r.literal)).map((r) => r.literal)),
    [rows, contractText],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function suggestWithAi() {
    setBusy("suggest");
    setError(null);
    try {
      const res = await fetch("/api/templates/suggest-variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError("AI suggestion limit reached. Add the placeholders manually, or try again later.");
        return;
      }
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Couldn't get suggestions.");
        return;
      }
      const incoming: Row[] = (data.variables ?? []).map((v: Row) => ({
        literal: v.literal,
        key: v.key,
        label: v.label || v.literal,
        type: v.type || "text",
      }));
      setRows((rs) => {
        const have = new Set(rs.map((r) => r.literal));
        return [...rs, ...incoming.filter((r) => r.literal && !have.has(r.literal))];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get suggestions.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/templates/from-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId,
          name: name.trim(),
          replacements: rows.filter((r) => r.literal.trim() && r.key.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? data.message ?? `Save failed (${res.status})`);
        return;
      }
      onSaved(data.template);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Replace the values that change between contracts (names, amounts, dates) with{" "}
            <code className="font-mono text-[12px]">{"{{placeholders}}"}</code>. Clause wording is kept verbatim.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-1">
          <RdgNoticeBar />

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Template name</label>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard NDA (outbound)" />
            {contractType && <p className="text-[11px] text-text-3">Contract type: {contractType}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Placeholders</label>
            <div className="flex gap-2">
              <Button size="xs" variant="outline" onClick={() => setRows((rs) => [...rs, { literal: "", key: "", label: "", type: "text" }])}>
                <Plus className="size-3" /> Row
              </Button>
              <Button size="xs" variant="outline" onClick={suggestWithAi} disabled={busy !== null}>
                {busy === "suggest" ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                Suggest variables
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-text-3">
                No placeholders yet. Add a row or use “Suggest variables”.
              </p>
            )}
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${INPUT} py-1 text-[12.5px] ${r.literal && !matched.has(r.literal) ? "border-risk-medium-line" : ""}`}
                  placeholder="literal text in the contract"
                  value={r.literal}
                  onChange={(e) => update(i, { literal: e.target.value })}
                />
                <span className="shrink-0 text-text-3">→</span>
                <input
                  className={`${INPUT} py-1 font-mono text-[12px]`}
                  placeholder="key"
                  value={r.key}
                  onChange={(e) => update(i, { key: e.target.value.replace(/[^\w]/g, "_") })}
                />
                <Select value={r.type} onValueChange={(v) => update(i, { type: v ?? "text" })}>
                  <SelectTrigger className="w-[104px] shrink-0" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["text", "textarea", "number", "date", "currency"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            {rows.some((r) => r.literal && !matched.has(r.literal)) && (
              <p className="text-[11px] text-risk-medium">
                Highlighted rows: that literal was not found verbatim in the contract and will be skipped.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Preview</label>
            <pre className="max-h-[220px] overflow-auto rounded-lg border border-border bg-background p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
              {preview.slice(0, 6000)}
            </pre>
          </div>

          {error && (
            <p className="rounded-lg border border-risk-high-line bg-risk-high-soft px-3 py-2 text-xs text-risk-high">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose} disabled={busy !== null}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim() || busy !== null}>
            {busy === "save" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Sparkles className="size-4" /> Save template</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
