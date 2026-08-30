"use client";

import { Suspense, useState, useEffect } from "react";
import {
  Upload, Pencil, Trash2, Sparkles, Lock,
  FileText, Shield, Clock,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { UploadModal } from "@/components/upload-modal";
import { CreateContractModal } from "@/components/create-contract-modal";
import { RdgNoticeBar } from "@/components/rdg-notice";
import { fileStore } from "@/lib/file-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// --- Types ---
type Contract  = {
  id: string;
  name: string;
  contract_type: string;
  risk_level: "high" | "medium" | "low" | null;
  total_issues: number;
  issues_fixed: number;
  issues_dismissed: number;
  created_at: string;
};

/** A contract is settled once every issue has been fixed or waved off. */
function isResolved(c: Contract) {
  return (
    c.total_issues > 0 &&
    c.issues_fixed + (c.issues_dismissed ?? 0) >= c.total_issues
  );
}

const FILTERS = ["All", "In review", "Signed"] as const;
type Filter = (typeof FILTERS)[number];

/** Risk pill: tinted ground, hairline in its own hue, severity dot. */
function RiskPill({ contract }: { contract: Contract }) {
  if (isResolved(contract)) {
    return (
      <span className="pill pill-low">
        <i />
        Clear
      </span>
    );
  }
  const level = contract.risk_level;
  if (!level) {
    return (
      <span className="pill pill-none">
        <i />
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "pill capitalize",
        level === "high" && "pill-high",
        level === "medium" && "pill-med",
        level === "low" && "pill-low"
      )}
    >
      <i />
      {level}
    </span>
  );
}

/** Status dot + label, derived from the same predicate the pill uses. */
function StatusDot({ contract }: { contract: Contract }) {
  const settled = isResolved(contract);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-2">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          settled ? "bg-risk-low" : "bg-risk-medium"
        )}
        aria-hidden
      />
      {settled ? "Resolved" : "In review"}
    </span>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText;
  label: string;
  value: number | string;
  tone?: "risk";
}) {
  return (
    <div className="flex flex-col gap-[7px] rounded-xl border border-border bg-surface px-3.5 py-3.5 shadow-e1">
      <span className="flex items-center gap-1.5 text-xs text-text-3">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
      <span
        className={cn(
          "text-2xl font-semibold tracking-[-0.03em] tabular-nums",
          tone === "risk" && "text-risk-high"
        )}
        data-numeric
      >
        {value}
      </span>
    </div>
  );
}

function DashboardContent() {
  const { isLoaded, isSignedIn } = useUser();
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [loading, setLoading]       = useState(true);
  const [genError, setGenError]     = useState<string | null>(null);

  async function loadContracts() {
    setLoading(true);
    const res = await fetch("/api/contracts");
    if (res.ok) {
      const { contracts } = await res.json();
      setContracts(contracts ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { loadContracts(); }, []);

  // --- Summary stats derived from real contracts ---
  const totalDocuments = contracts.length;
  const totalFixes     = contracts.reduce((s, c) => s + c.issues_fixed, 0);
  const highRiskCount  = contracts.filter(c => c.risk_level === "high" && !isResolved(c)).length;
  const openIssues     = contracts.reduce(
    (s, c) => s + Math.max(0, c.total_issues - c.issues_fixed - (c.issues_dismissed ?? 0)),
    0,
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen]           = useState(false);
  const [createOpen, setCreateOpen]         = useState(false);
  // View-only filter over the contracts already in state — no fetch, no API.
  const [filter, setFilter]                 = useState<Filter>("All");

  // Auto-open the matching modal when the sidebar navigates here with
  // ?generate=1 or ?upload=1. ?template=1 opens straight on the "From template"
  // step; ?template=<id> preselects that template.
  const [tplStart, setTplStart] = useState<{ from: boolean; id?: string }>({ from: false });
  useEffect(() => {
    if (searchParams.get("generate") === "1") {
      const t = searchParams.get("template");
      setTplStart({ from: t != null, id: t && t !== "1" ? t : undefined });
      setCreateOpen(true);
      router.replace("/dashboard");
    } else if (searchParams.get("upload") === "1") {
      setModalOpen(true);
      router.replace("/dashboard");
    }
  }, [searchParams, router]);
  const [generating, setGenerating]         = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState("");

  function startEdit(contract: Contract) {
    setEditingId(contract.id);
    setEditName(contract.name);
  }

  async function saveEdit(id: string) {
    await fetch(`/api/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    setContracts(prev => prev.map(c => c.id === id ? { ...c, name: editName } : c));
    setEditingId(null);
  }

  async function deleteContract(id: string) {
    await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    setContracts(prev => prev.filter(c => c.id !== id));
  }

  const visible = contracts.filter(c =>
    filter === "All" ? true : filter === "Signed" ? isResolved(c) : !isResolved(c)
  );

  return (
    <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
      {/* Standing RDG notice — the first thing on the Contracts view, every time. */}
      <RdgNoticeBar />

      {/* Guest banner — contracts can be analysed but not saved without an account */}
      {isLoaded && !isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-risk-medium-line bg-risk-medium-soft px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <Lock className="size-4 shrink-0 text-risk-medium" />
            <span>You&apos;re browsing as a guest. You can analyse a contract, but saving requires an account.</span>
          </div>
          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Contracts</h1>
          <p className="mt-1 text-[13px] text-text-2">
            {totalDocuments} {totalDocuments === 1 ? "document" : "documents"}
            {" · "}
            {openIssues} {openIssues === 1 ? "clause" : "clauses"} flagged for a closer look
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => { setTplStart({ from: false }); setCreateOpen(true); }}>
            <Sparkles className="size-4" />
            Generate
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
        {genError && (
          <div className="w-full rounded-lg border border-risk-high-line bg-risk-high-soft px-3.5 py-2 text-xs break-all text-risk-high">
            {genError}
          </div>
        )}
        <UploadModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAnalyze={(file, name, contractType) => {
            fileStore.set(file);
            setModalOpen(false);
            router.push(`/analysis?file=${encodeURIComponent(name)}&type=${encodeURIComponent(contractType)}`);
          }}
        />
        <CreateContractModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          generating={generating}
          startFromTemplate={tplStart.from}
          initialTemplateId={tplStart.id}
          onGenerate={async ({ name, contractType, party1, party2, language, keyTerms, propertyAddress, baseRentEur, operatingCostsEur, depositEur, templateId, values, useRender }) => {
            setGenerating(true);
            setGenError(null);
            try {
              // Step 1: produce the initial draft.
              //  - template + no key terms  → instant pure render (no AI)
              //  - template + key terms     → AI generate, template as a binding constraint
              //  - no template              → AI generate (German leases go through the grounded RAG pipeline)
              const genRes = useRender && templateId
                ? await fetch(`/api/templates/${templateId}/render`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ values, language }),
                  })
                : await fetch("/api/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contractType, party1, party2, language, keyTerms, propertyAddress, baseRentEur, operatingCostsEur, depositEur, templateId, values }),
                  });
              const genData = await genRes.json();
              if (Array.isArray(genData.missing) && genData.missing.length > 0) {
                setGenError(`Template rendered with unfilled fields: ${genData.missing.join(", ")}. You can fix them in the editor.`);
              }
              if (genRes.status === 429) {
                const mins = Math.max(1, Math.round((Number(genData.retry_after) || 3600) / 60));
                setGenError(
                  `Generation limit reached${genData.scope === "guest" ? " (sign in for higher limits)" : ""}. Try again in about ${mins} min.`,
                );
                setCreateOpen(false);
                return;
              }
              if (!genRes.ok || !genData.text) {
                setGenError(genData.message ?? "Couldn't generate the contract. Please try again.");
                setCreateOpen(false);
                return;
              }

              // Step 2: Save to Supabase so edits and chat are persisted
              const saveRes = await fetch("/api/contracts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name,
                  contract_type: contractType,
                  extracted_text: genData.text,
                  risk_level: "low",
                  clauses: [],
                }),
              });
              const saveData = await saveRes.json();
              if (saveRes.status === 401) {
                setGenError("Sign in to save a generated contract.");
                setCreateOpen(false);
                return;
              }
              if (!saveRes.ok) {
                setGenError(saveData.message ?? "Couldn't save the generated contract. Please try again.");
                setCreateOpen(false);
                return;
              }

              setCreateOpen(false);
              await loadContracts();
              router.push(
                `/review?contractId=${saveData.id}&file=${encodeURIComponent(name)}&type=${encodeURIComponent(contractType)}&mode=create`
              );
            } catch (err) {
              console.error("[generate]", err);
              setGenError("Couldn't generate the contract. Please try again.");
            } finally {
              setGenerating(false);
            }
          }}
        />
      </section>

      {/* Stat row */}
      <section className="grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        <Stat icon={FileText} label="Documents" value={totalDocuments} />
        <Stat icon={Shield} label="Flagged, high" value={highRiskCount} tone="risk" />
        <Stat icon={Sparkles} label="Suggestions applied" value={totalFixes} />
        <Stat icon={Clock} label="Open issues" value={openIssues} />
      </section>

      {/* Contracts table */}
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2.5 border-b border-border px-3.5 py-3 [.border-b]:pb-3">
          <CardTitle className="text-[13.5px]">All contracts</CardTitle>
          {/* The filter sits with the table it controls rather than in the page
              head, so the control and its effect are never out of eyeshot. */}
          <div className="seg" role="tablist" aria-label="Filter contracts">
            {FILTERS.map(f => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className="seg-btn"
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3.5">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-3.5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-[13px] text-text-3">
                    <span className="inline-flex items-center gap-2 font-mono text-xs">
                      Analysing
                      <span className="shimmer-track inline-block h-1 w-[46px]" aria-hidden />
                    </span>
                  </TableCell>
                </TableRow>
              )}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-[13px] text-text-3">
                    {contracts.length === 0
                      ? "No contracts yet. Upload one, or hit “Seed test data” to try it out."
                      : `Nothing in “${filter}”.`}
                  </TableCell>
                </TableRow>
              )}
              {visible.map(contract => (
                <TableRow
                  key={contract.id}
                  className="cursor-pointer"
                  onClick={() => {
                    if (editingId === contract.id) return;
                    router.push(
                      `/review?file=${encodeURIComponent(contract.name)}&type=${encodeURIComponent(contract.contract_type ?? "")}&contractId=${contract.id}`
                    );
                  }}
                >
                  <TableCell className="pl-3.5 font-medium">
                    {editingId === contract.id ? (
                      <input
                        className="w-full rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-[13px] focus-visible:outline-none"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(contract.id); }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-surface-3 text-text-3">
                          <FileText className="size-3.5" aria-hidden />
                        </span>
                        <span className="truncate">{contract.name}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-text-2">
                    {contract.contract_type || "—"}
                  </TableCell>
                  <TableCell>
                    <RiskPill contract={contract} />
                  </TableCell>
                  <TableCell className="font-mono text-text-2">
                    {contract.issues_fixed + (contract.issues_dismissed ?? 0)}/{contract.total_issues}
                  </TableCell>
                  <TableCell>
                    <StatusDot contract={contract} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-text-3">
                    {new Date(contract.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="pr-3.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {editingId === contract.id ? (
                        <Button size="sm" onClick={() => saveEdit(contract.id)}>
                          Save
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon-sm" aria-label="Rename" onClick={() => startEdit(contract)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                        className="text-text-3 hover:text-risk-high"
                        onClick={() => deleteContract(contract.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
