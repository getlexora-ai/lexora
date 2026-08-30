"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, Plus, Search } from "lucide-react";
import { SignInButton, useUser } from "@clerk/nextjs";
import { RdgNoticeBar } from "@/components/rdg-notice";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplatePreview } from "@/components/templates/template-preview";
import { TemplateEditor } from "@/components/templates/template-editor";
import type { ContractTemplate } from "@/lib/contract-templates";

type Scope = "all" | "curated" | "user";

export default function TemplatesPage() {
  const { isLoaded, isSignedIn } = useUser();

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [contractType, setContractType] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [queryTerm, setQueryTerm] = useState("");

  const [preview, setPreview] = useState<ContractTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (contractType) sp.set("contract_type", contractType);
    if (scope !== "all") sp.set("source", scope);
    if (queryTerm.trim()) sp.set("q", queryTerm.trim());
    try {
      const res = await fetch(`/api/templates?${sp.toString()}`);
      const data = await res.json();
      setTemplates(data.templates ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [contractType, scope, queryTerm]);

  useEffect(() => { void load(); }, [load]);

  function onSaved(t: ContractTemplate) {
    setTemplates((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [t, ...prev];
      const next = prev.slice();
      next[i] = t;
      return next;
    });
    void load();
  }

  const list = useMemo(() => templates, [templates]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
        <RdgNoticeBar />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2 px-6 py-16 text-center">
          <LayoutGrid className="size-6 text-text-3" />
          <p className="text-[15px] font-semibold">Sign in to use templates</p>
          <p className="max-w-sm text-[13px] text-text-3">
            Start from a curated German lease skeleton or save your own contracts as reusable templates.
          </p>
          <SignInButton mode="modal"><Button size="sm">Sign in</Button></SignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
      <RdgNoticeBar />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Templates</h1>
          <p className="text-[13px] text-text-3">
            {loading ? "Loading…" : `${total} template${total === 1 ? "" : "s"}`} · placeholder-driven skeletons that feed the generator
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus className="size-4" /> New template
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={contractType || "__all"} onValueChange={(v) => setContractType(v === "__all" ? "" : (v ?? ""))}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All contract types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All contract types</SelectItem>
            {CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="seg" role="tablist" aria-label="Template scope">
          {(["all", "curated", "user"] as Scope[]).map((s) => (
            <button key={s} type="button" role="tab" className="seg-btn"
              aria-selected={scope === s} onClick={() => setScope(s)}>
              {s === "all" ? "All" : s === "curated" ? "Curated" : "Mine"}
            </button>
          ))}
        </div>

        <form
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5"
          onSubmit={(e) => { e.preventDefault(); setQueryTerm(q); }}
        >
          <Search className="size-3.5 text-text-3" />
          <input
            className="w-[200px] bg-transparent text-sm focus:outline-none"
            placeholder="Search templates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {queryTerm && (
            <button type="button" className="text-[11px] text-text-3 hover:text-foreground"
              onClick={() => { setQ(""); setQueryTerm(""); }}>clear</button>
          )}
        </form>
      </div>

      {loading && list.length === 0 ? (
        <div className="py-16 text-center text-text-3"><Loader2 className="mx-auto size-4 animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-2 px-6 py-16 text-center text-[13px] text-text-3">
          No templates match. <button className="text-brand hover:underline" onClick={() => { setEditing(null); setEditorOpen(true); }}>Create one</button>
          {" "}or open a contract and choose “Save as template”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onPreview={setPreview}
              onEdit={(tpl) => { setEditing(tpl); setEditorOpen(true); }}
            />
          ))}
        </div>
      )}

      <TemplatePreview template={preview} open={!!preview} onClose={() => setPreview(null)} />
      <TemplateEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        template={editing}
        onSaved={onSaved}
      />
    </div>
  );
}
