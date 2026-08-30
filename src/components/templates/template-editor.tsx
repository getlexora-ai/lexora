"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import type { ContractTemplate, TemplateVariable } from "@/lib/contract-templates";

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

const VAR_TYPES: TemplateVariable["type"][] = [
  "text", "textarea", "number", "date", "select", "currency", "derived",
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** null = create a new template. */
  template: ContractTemplate | null;
  onSaved: (t: ContractTemplate) => void;
};

export function TemplateEditor({ open, onClose, template, onSaved }: Props) {
  const isEdit = !!template;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState("");
  const [contractType, setContractType] = useState("Other");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("de");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setContractType(template?.contract_type ?? "Other");
    setDescription(template?.description ?? "");
    setLanguage(template?.language ?? "de");
    setBody(template?.body ?? "");
    setTags((template?.tags ?? []).join(", "));
    setVariables(template?.variables ?? []);
    setError(null);
  }, [open, template]);

  function insertPlaceholder(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  function updateVar(i: number, patch: Partial<TemplateVariable>) {
    setVariables((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      contract_type: contractType,
      description: description.trim() || null,
      language,
      body,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      variables: variables.filter((v) => v.key.trim()),
    };
    try {
      const res = await fetch(
        isEdit ? `/api/templates/${template!.id}` : "/api/templates",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
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
      setSaving(false);
    }
  }

  const canSave = name.trim() && contractType && body.trim() && !saving;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Body is authoritative text with <code className="font-mono text-[12px]">{"{{placeholders}}"}</code>.
            Everything ships unreviewed until a lawyer confirms it (RDG).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contract type</label>
              <Select value={contractType} onValueChange={(v) => setContractType(v ?? "Other")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input className={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Language</label>
              <Select value={language} onValueChange={(v) => setLanguage(v ?? "de")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">de</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="text-sm font-medium">Body</label>
              {variables.filter((v) => v.key.trim()).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertPlaceholder(v.key)}
                  className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-text-2 hover:bg-surface-2"
                >
                  + {"{{"}{v.key}{"}}"}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              className={`${INPUT} min-h-[220px] resize-y font-mono text-[12.5px] leading-relaxed`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {template?.sections && template.sections.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sections <span className="font-normal text-muted-foreground">(structured index, read-only)</span></label>
              <ul className="rounded-lg border border-border divide-y divide-border text-[12.5px]">
                {template.sections.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="font-mono text-text-3">{s.key}</span>
                    <span className="truncate">{s.heading}</span>
                    {s.required && <span className="ml-auto pill pill-none"><i />required</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Variables</label>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setVariables((vs) => [...vs, { key: "", label: "", type: "text" }])}
              >
                <Plus className="size-3" /> Add
              </Button>
            </div>
            {variables.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${INPUT} py-1 font-mono text-[12px]`}
                  placeholder="key"
                  value={v.key}
                  onChange={(e) => updateVar(i, { key: e.target.value.replace(/[^\w]/g, "_") })}
                />
                <input
                  className={`${INPUT} py-1`}
                  placeholder="label"
                  value={v.label}
                  onChange={(e) => updateVar(i, { label: e.target.value })}
                />
                <Select value={v.type} onValueChange={(val) => updateVar(i, { type: (val ?? "text") as TemplateVariable["type"] })}>
                  <SelectTrigger className="w-[110px] shrink-0" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VAR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-text-3">
                  <input type="checkbox" checked={!!v.required} onChange={(e) => updateVar(i, { required: e.target.checked })} />
                  req
                </label>
                <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            {variables.some((v) => v.type === "derived") && (
              <p className="text-[11px] text-text-3">
                Set a derived variable&apos;s formula in <code className="font-mono">expr</code> (e.g.{" "}
                <code className="font-mono">baseRentEur + operatingCostsEur</code>). Only + - * / and other variable names are allowed.
              </p>
            )}
            {variables.map((v, i) =>
              v.type === "derived" ? (
                <input
                  key={`expr-${i}`}
                  className={`${INPUT} py-1 font-mono text-[12px]`}
                  placeholder={`expr for {{${v.key || "…"}}}`}
                  value={v.expr ?? ""}
                  onChange={(e) => updateVar(i, { expr: e.target.value })}
                />
              ) : null,
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags <span className="font-normal text-muted-foreground">(comma-separated)</span></label>
            <input className={INPUT} value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          {error && (
            <p className="rounded-lg border border-risk-high-line bg-risk-high-soft px-3 py-2 text-xs text-risk-high">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}><X className="size-4" /> Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
