"use client";

import { Suspense, useState, useEffect } from "react";
import { Upload, Pencil, Trash2, FlaskConical, Loader2, Sparkles, Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { UploadModal } from "@/components/upload-modal";
import { CreateContractModal } from "@/components/create-contract-modal";
import { fileStore } from "@/lib/file-store";
import { analysisStore } from "@/lib/analysis-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// --- Colors ---
const DOCS_COLOR   = "#6366f1"; // indigo
const FIXES_COLOR  = "#10b981"; // emerald
const HIGH_COLOR   = "#ef4444"; // red
const MEDIUM_COLOR = "#f59e0b"; // amber
const LOW_COLOR    = "#3b82f6"; // blue

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
  tick: { fontSize: 11, fill: "#94a3b8" },
} as const;

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

  // Auto-open generate modal when sidebar navigates here with ?generate=1
  useEffect(() => {
    if (searchParams.get("generate") === "1") {
      setCreateOpen(true);
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

  return (
    <div className="px-8 py-10 space-y-8 max-w-[1200px]">
      {/* Guest banner — contracts can be analysed but not saved without an account */}
      {isLoaded && !isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <Lock className="h-4 w-4 shrink-0" />
            <span>You&apos;re browsing as a guest. You can analyse a contract, but saving requires an account.</span>
          </div>
          <SignInButton mode="modal">
            <button className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700">
              Sign in
            </button>
          </SignInButton>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            Contract Intelligence Overview
          </h1>
          <p className="text-muted-foreground">
            Monitoring legal health and compliance risk across your portfolio.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="gap-2" onClick={seedTestData} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Seed test data
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Generate Contract
          </Button>
          <Button className="gap-2" onClick={() => setModalOpen(true)}>
            <Upload className="h-4 w-4" />
            Upload Contract
          </Button>
        </div>
        {seedError && (
          <div className="w-full rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 break-all">
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

      {/* Top two stat charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1 — Documents scanned */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Documents Scanned
            </CardTitle>
            <p className="text-3xl font-bold">{totalDocuments}</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={docsConfig} className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={documentsData} barSize={20}>
                  <defs>
                    <linearGradient id="docsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={DOCS_COLOR} stopOpacity={1}   />
                      <stop offset="100%" stopColor={DOCS_COLOR} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" {...axisProps} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="docs" fill="url(#docsGrad)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 2 — Total legal fixes by AI */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Total Legal Fixes by AI
            </CardTitle>
            <p className="text-3xl font-bold">{totalFixes}</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={fixesConfig} className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fixesData}>
                  <defs>
                    <linearGradient id="fixesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={FIXES_COLOR} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={FIXES_COLOR} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" {...axisProps} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="fixes"
                    stroke={FIXES_COLOR}
                    strokeWidth={2.5}
                    fill="url(#fixesGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* 3 — Risk trends (full width) */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Risk Trends Over Time
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              High, medium, and low risk contracts — last 6 months
            </p>
          </div>
          {/* Manual legend */}
          <div className="flex items-center gap-5 text-xs font-medium">
            {[
              { label: `High (${currentRisk.high})`,     color: HIGH_COLOR   },
              { label: `Medium (${currentRisk.medium})`, color: MEDIUM_COLOR },
              { label: `Low (${currentRisk.low})`,       color: LOW_COLOR    },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={riskConfig} className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={riskData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" {...axisProps} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="high"   stroke={HIGH_COLOR}   strokeWidth={2} dot={{ r: 2.5, fill: HIGH_COLOR,   strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="medium" stroke={MEDIUM_COLOR} strokeWidth={2} dot={{ r: 2.5, fill: MEDIUM_COLOR, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="low"    stroke={LOW_COLOR}    strokeWidth={2} dot={{ r: 2.5, fill: LOW_COLOR,    strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Contracts table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Saved Contracts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Contract Name</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Resolved</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading contracts…
                  </TableCell>
                </TableRow>
              )}
              {!loading && contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No contracts yet — upload one or click &quot;Seed test data&quot; to try it out.
                  </TableCell>
                </TableRow>
              )}
              {contracts.map(contract => (
                <TableRow
                  key={contract.id}
                  className="h-16 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    if (editingId === contract.id) return;
                    router.push(
                      `/review?file=${encodeURIComponent(contract.name)}&type=${encodeURIComponent(contract.contract_type ?? "")}&contractId=${contract.id}`
                    );
                  }}
                >
                  <TableCell className="pl-6 font-medium">
                    {editingId === contract.id ? (
                      <input
                        className="w-full rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(contract.id); }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      contract.name
                    )}
                  </TableCell>
                  <TableCell>
                    {(contract.issues_fixed + (contract.issues_dismissed ?? 0)) >= contract.total_issues && contract.total_issues > 0 ? (
                      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50">
                        No Risk
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          contract.risk_level === "high"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : contract.risk_level === "medium"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }
                      >
                        {contract.risk_level ?? "—"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contract.total_issues}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contract.issues_fixed + (contract.issues_dismissed ?? 0)} / {contract.total_issues}
                    {(contract.issues_dismissed ?? 0) > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground/70">
                        ({contract.issues_fixed} fixed, {contract.issues_dismissed} dismissed)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(contract.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="pr-6 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {editingId === contract.id ? (
                        <Button size="sm" onClick={() => saveEdit(contract.id)}>
                          Save
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => startEdit(contract)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteContract(contract.id)}
                      >
                        <Trash2 className="h-4 w-4" />
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
