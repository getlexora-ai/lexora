"use client";

import { Suspense, useState, useEffect } from "react";
import {
  Upload, Pencil, Trash2, FlaskConical, Loader2, Sparkles, Lock,
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  BarChart, Bar,
  AreaChart, Area,
  LineChart, Line,
  XAxis, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

// --- Colors — the risk tokens, read live from CSS so the charts re-theme with
// the toggle instead of being frozen to one palette. Charts are client-rendered
// SVG, and var() resolves in SVG presentation attributes. ---
const DOCS_COLOR   = "var(--text-2)";
const FIXES_COLOR  = "var(--low)";
const HIGH_COLOR   = "var(--high)";
const MEDIUM_COLOR = "var(--med)";
const LOW_COLOR    = "var(--low)";

// --- Types ---
type DocEntry  = { month: string; docs: number };
type FixEntry  = { month: string; fixes: number };
type RiskEntry = { month: string; high: number; medium: number; low: number };
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

const docsConfig  = { docs:   { label: "Documents", color: DOCS_COLOR  } };
const fixesConfig = { fixes:  { label: "AI Fixes",  color: FIXES_COLOR } };
const riskConfig  = {
  high:   { label: "High Risk",   color: HIGH_COLOR   },
  medium: { label: "Medium Risk", color: MEDIUM_COLOR },
  low:    { label: "Low Risk",    color: LOW_COLOR    },
};

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--text-3)" },
} as const;

const gridColor = "var(--border)";

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

/** Card chrome shared by the three chart panels. */
function ChartCard({
  title,
  meta,
  legend,
  children,
}: {
  title: string;
  meta?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* [.border-b]:pb-3 restates the primitive's bordered-header padding at
          the density this bar wants — the variant selector outranks a plain
          py-*, so it has to be answered in kind. */}
      <CardHeader className="flex flex-row items-center justify-between gap-2.5 border-b border-border px-3.5 py-3 [.border-b]:pb-3">
        <CardTitle className="text-[13.5px]">{title}</CardTitle>
        {legend}
        {meta && <span className="font-mono text-[11.5px] text-text-3">{meta}</span>}
      </CardHeader>
      <CardContent className="p-3.5">{children}</CardContent>
    </Card>
  );
}

const DUMMY_CONTRACT = {
  name: "Master Service Agreement — Test Corp",
  contract_type: "MSA",
  extracted_text: "This is a test contract. Provider's liability shall be limited to one dollar ($1). All intellectual property created belongs exclusively to Provider in perpetuity.",
  risk_level: "high" as const,
  clauses: [
    {
      type: "high" as const,
      clause: "Clause 3: Limitation of Liability",
      passage: "Provider's liability shall be limited to one dollar ($1).",
      issue: "Liability cap is unreasonably low",
      suggestion: "Provider's total aggregate liability shall not exceed the total fees paid by Client in the twelve (12) months preceding the claim.",
      sort_order: 0,
    },
    {
      type: "medium" as const,
      clause: "Clause 4: Intellectual Property",
      passage: "All intellectual property created belongs exclusively to Provider in perpetuity.",
      issue: "Client retains no IP rights",
      suggestion: "All work product created by Provider solely in connection with the Services shall be deemed works made for hire and shall be the exclusive property of Client upon full payment of all fees.",
      sort_order: 1,
    },
  ],
};

function DashboardContent() {
  const { isLoaded, isSignedIn } = useUser();
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [loading, setLoading]       = useState(true);
  const [seeding, setSeeding]       = useState(false);
  const [seedError, setSeedError]   = useState<string | null>(null);

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

  async function seedTestData() {
    setSeeding(true);
    setSeedError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DUMMY_CONTRACT),
      });
      const json = await res.json();
      if (res.status === 401) {
        setSeedError("Sign in to save contracts.");
      } else if (!res.ok) {
        setSeedError(`${res.status} — ${json.error ?? JSON.stringify(json)}`);
      } else {
        await loadContracts();
      }
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Unknown error");
    }
    setSeeding(false);
  }

  // --- Summary stats derived from real contracts ---
  const totalDocuments = contracts.length;
  const totalFixes     = contracts.reduce((s, c) => s + c.issues_fixed, 0);
  const highRiskCount  = contracts.filter(c => c.risk_level === "high" && !isResolved(c)).length;
  const openIssues     = contracts.reduce(
    (s, c) => s + Math.max(0, c.total_issues - c.issues_fixed - (c.issues_dismissed ?? 0)),
    0,
  );
  const currentRisk    = {
    high:   contracts.filter(c => c.risk_level === "high").length,
    medium: contracts.filter(c => c.risk_level === "medium").length,
    low:    contracts.filter(c => c.risk_level === "low").length,
  };

  // --- Chart series data ---
  const [documentsData, _setDocumentsData] = useState<DocEntry[]>([    { month: "Oct", docs: 4 },
    { month: "Nov", docs: 7 },
    { month: "Dec", docs: 5 },
    { month: "Jan", docs: 10 },
    { month: "Feb", docs: 8 },
    { month: "Mar", docs: 13 },
  ]);

  const [fixesData, _setFixesData] = useState<FixEntry[]>([
    { month: "Oct", fixes: 12 },
    { month: "Nov", fixes: 19 },
    { month: "Dec", fixes: 14 },
    { month: "Jan", fixes: 27 },
    { month: "Feb", fixes: 22 },
    { month: "Mar", fixes: 34 },
  ]);

  const [riskData, _setRiskData] = useState<RiskEntry[]>([
    { month: "Oct", high: 3, medium: 5,  low: 8  },
    { month: "Nov", high: 5, medium: 7,  low: 6  },
    { month: "Dec", high: 2, medium: 9,  low: 10 },
    { month: "Jan", high: 6, medium: 8,  low: 7  },
    { month: "Feb", high: 4, medium: 6,  low: 12 },
    { month: "Mar", high: 5, medium: 10, low: 9  },
  ]);


  const router = useRouter();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen]           = useState(false);
  const [createOpen, setCreateOpen]         = useState(false);
  // View-only filter over the contracts already in state — no fetch, no API.
  const [filter, setFilter]                 = useState<Filter>("All");

  // Auto-open the matching modal when the sidebar navigates here with
  // ?generate=1 or ?upload=1.
  useEffect(() => {
    if (searchParams.get("generate") === "1") {
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
          <Button variant="outline" onClick={seedTestData} disabled={seeding}>
            {seeding ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
            Seed test data
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Sparkles className="size-4" />
            Generate
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
        {seedError && (
          <div className="w-full rounded-lg border border-risk-high-line bg-risk-high-soft px-3.5 py-2 text-xs break-all text-risk-high">
            {seedError}
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
          onGenerate={async ({ name, contractType, party1, party2, jurisdiction, keyTerms }) => {
            setGenerating(true);
            try {
              // Step 1: Claude generates the initial draft
              const genRes = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractType, party1, party2, jurisdiction, keyTerms }),
              });
              const genData = await genRes.json();
              if (genRes.status === 429) {
                const mins = Math.max(1, Math.round((Number(genData.retry_after) || 3600) / 60));
                setSeedError(
                  `Generation limit reached${genData.scope === "guest" ? " (sign in for higher limits)" : ""}. Try again in about ${mins} min.`,
                );
                setCreateOpen(false);
                return;
              }
              if (!genRes.ok || !genData.text) {
                setSeedError(genData.message ?? "Couldn't generate the contract. Please try again.");
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
                setSeedError("Sign in to save a generated contract.");
                setCreateOpen(false);
                return;
              }
              if (!saveRes.ok) {
                setSeedError(saveData.message ?? "Couldn't save the generated contract. Please try again.");
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
              setSeedError("Couldn't generate the contract. Please try again.");
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

      {/* Two smaller series */}
      <section className="grid grid-cols-1 gap-4.5 md:grid-cols-2">
        <ChartCard title="Documents scanned" meta="last 6 months">
          <ChartContainer config={docsConfig} className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={documentsData} barSize={20}>
                <CartesianGrid vertical={false} stroke={gridColor} />
                <XAxis dataKey="month" {...axisProps} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="docs" fill={DOCS_COLOR} fillOpacity={0.55} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="Suggestions applied" meta="last 6 months">
          <ChartContainer config={fixesConfig} className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fixesData}>
                <defs>
                  <linearGradient id="fixesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={FIXES_COLOR} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={FIXES_COLOR} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={gridColor} />
                <XAxis dataKey="month" {...axisProps} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="fixes"
                  stroke={FIXES_COLOR}
                  strokeWidth={2.25}
                  fill="url(#fixesGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </ChartCard>
      </section>

      {/* Portfolio risk — full width */}
      <ChartCard
        title="Portfolio risk — last 6 months"
        legend={
          <div className="flex gap-3.5 text-[11px] text-text-2">
            {[
              { label: `High (${currentRisk.high})`,     color: HIGH_COLOR   },
              { label: `Medium (${currentRisk.medium})`, color: MEDIUM_COLOR },
              { label: `Low (${currentRisk.low})`,       color: LOW_COLOR    },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5">
                <i className="size-2 rounded-[2px]" style={{ background: color }} aria-hidden />
                {label}
              </span>
            ))}
          </div>
        }
      >
        <ChartContainer config={riskConfig} className="h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={riskData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={gridColor} />
              <XAxis dataKey="month" {...axisProps} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="high"   stroke={HIGH_COLOR}   strokeWidth={2.25} dot={{ r: 2.5, fill: HIGH_COLOR,   strokeWidth: 0 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="medium" stroke={MEDIUM_COLOR} strokeWidth={2.25} dot={{ r: 2.5, fill: MEDIUM_COLOR, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="low"    stroke={LOW_COLOR}    strokeWidth={2.25} dot={{ r: 2.5, fill: LOW_COLOR,    strokeWidth: 0 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </ChartCard>

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
                      ? "No contracts yet — upload one or hit “Seed test data” to try it out."
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
