"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, BookOpen, Sparkles } from "lucide-react";
import { SignInButton, useUser } from "@clerk/nextjs";
import { RdgNoticeBar } from "@/components/rdg-notice";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CLAUSE_TOPICS, topicLabel } from "@/lib/clause-taxonomy";
import { ClauseDialog, type ClauseRow } from "@/components/clauses/clause-dialog";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import { cn } from "@/lib/utils";

const POSTURE_PILL: Record<ClauseRow["posture"], string> = {
  preferred: "pill-low",
  fallback: "pill-med",
  walk_away: "pill-high",
};
const POSTURE_TEXT: Record<ClauseRow["posture"], string> = {
  preferred: "Preferred",
  fallback: "Fallback",
  walk_away: "Walk-away",
};

type Scope = "all" | "mine" | "curated";

export default function ClausesPage() {
  const { isLoaded, isSignedIn } = useUser();

  const [rows, setRows] = useState<ClauseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<string>("");
  const [posture, setPosture] = useState<string>("");
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [queryTerm, setQueryTerm] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [searchMode, setSearchMode] = useState<"semantic" | "lexical" | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<ClauseRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Semantic search: POST the query, meaning-rank against pgvector.
      if (semantic && queryTerm.trim()) {
        const res = await fetch("/api/clause-library/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: queryTerm.trim(), type: type || undefined }),
        });
        const data = await res.json();
        const hits: ClauseRow[] = data.hits ?? [];
        setRows(hits);
        setTotal(hits.length);
        setSearchMode(data.mode ?? null);
        return;
      }
      setSearchMode(null);
      const sp = new URLSearchParams();
      if (type) sp.set("type", type);
      if (posture) sp.set("posture", posture);
      if (scope !== "all") sp.set("scope", scope);
      if (queryTerm.trim()) sp.set("q", queryTerm.trim());
      const res = await fetch(`/api/clause-library?${sp.toString()}`);
      const data = await res.json();
      setRows(data.clauses ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [type, posture, scope, queryTerm, semantic]);

  useEffect(() => { void load(); }, [load]);

  function openNew() { setActive(null); setDialogOpen(true); }
  function openRow(r: ClauseRow) { setActive(r); setDialogOpen(true); }

  function onSaved(c: ClauseRow) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === c.id);
      if (i === -1) return [c, ...prev];
      const next = prev.slice();
      next[i] = c;
      return next;
    });
    setActive(c);
    void load();
  }
  function onDeleted(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  const topicOptions = useMemo(() => CLAUSE_TOPICS, []);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
        <RdgNoticeBar />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2 px-6 py-16 text-center">
          <BookOpen className="size-6 text-text-3" />
          <p className="text-[15px] font-semibold">Sign in to use the clause library</p>
          <p className="max-w-sm text-[13px] text-text-3">
            Browse curated, statute-anchored German lease clauses and build your own set.
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
          <h1 className="text-[19px] font-semibold tracking-tight">Clause library</h1>
          <p className="text-[13px] text-text-3">
            {loading ? "Loading…" : `${total} clause${total === 1 ? "" : "s"}`} · reusable wording, grounded in German law
          </p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="size-4" /> New clause</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={type || "__all"} onValueChange={(v) => setType(v === "__all" ? "" : (v ?? ""))}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All topics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All topics</SelectItem>
            {topicOptions.map((t) => (
              <SelectItem key={t.key} value={t.key}>{topicLabel(t.key)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={posture || "__all"} onValueChange={(v) => setPosture(v === "__all" ? "" : (v ?? ""))}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Any posture" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Any posture</SelectItem>
            <SelectItem value="preferred">Preferred</SelectItem>
            <SelectItem value="fallback">Fallback</SelectItem>
            <SelectItem value="walk_away">Walk-away</SelectItem>
          </SelectContent>
        </Select>

        <div className="seg" role="tablist" aria-label="Clause scope">
          {(["all", "curated", "mine"] as Scope[]).map((s) => (
            <button key={s} type="button" role="tab" className="seg-btn"
              aria-selected={scope === s} onClick={() => setScope(s)}>
              {s === "all" ? "All" : s === "curated" ? "Curated" : "Mine"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="seg-btn"
            data-on={semantic}
            aria-pressed={semantic}
            title="Meaning-based search (uses the AI embedding index)"
            onClick={() => setSemantic((v) => !v)}
          >
            <Sparkles className="mr-1 inline size-3.5" /> Semantic
          </button>
          <form
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5"
            onSubmit={(e) => { e.preventDefault(); setQueryTerm(q); }}
          >
            <Search className="size-3.5 text-text-3" />
            <input
              className="w-[200px] bg-transparent text-sm focus:outline-none"
              placeholder={semantic ? "Describe the clause…" : "Search wording…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {queryTerm && (
              <button type="button" className="text-[11px] text-text-3 hover:text-foreground"
                onClick={() => { setQ(""); setQueryTerm(""); }}>clear</button>
            )}
          </form>
        </div>
      </div>

      {semantic && searchMode === "lexical" && queryTerm && (
        <p className="-mt-1 text-[12px] text-text-3">
          Semantic index unavailable — showing a keyword match instead. Run{" "}
          <code className="font-mono text-[11px]">npm run seed:library -- --embed</code> to enable it.
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Posture</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-text-3">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-[13px] text-text-3">
                No clauses match. {scope !== "curated" && <button className="text-brand hover:underline" onClick={openNew}>Add one</button>}
              </TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openRow(r)}>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium">{r.title}</div>
                    {r.summary && <div className="truncate text-[12px] text-text-3">{r.summary}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px] text-text-2">{topicLabel(r.clause_type)}</TableCell>
                  <TableCell>
                    <span className={cn("pill", POSTURE_PILL[r.posture])}><i />{POSTURE_TEXT[r.posture]}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px] text-text-2">{r.reference ?? "—"}</TableCell>
                  <TableCell><ApprovalBadge approved={r.is_approved} /></TableCell>
                  <TableCell className="text-[12px] text-text-3">{r.readonly ? "Curated" : r.source === "imported" ? "Imported" : "Mine"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClauseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        clause={active}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}
