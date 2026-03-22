"use client";

import { useState } from "react";
import { Upload, Pencil, Trash2 } from "lucide-react";
import { UploadModal } from "@/components/upload-modal";
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
type DocEntry    = { month: string; docs: number };
type FixEntry    = { month: string; fixes: number };
type RiskEntry   = { month: string; high: number; medium: number; low: number };
type RiskLevel   = "High" | "Medium" | "Low";
type Contract    = {
  id: string;
  name: string;
  risk: RiskLevel;
  issues: number;
  issuesFixed: number;
  saved: string;
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

export default function DashboardPage() {
  // --- Summary stats ---
  const [totalDocuments, _setTotalDocuments] = useState(47);
  const [totalFixes, _setTotalFixes]         = useState(128);
  const [currentRisk, _setCurrentRisk]       = useState({ high: 5, medium: 10, low: 9 });

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

  const [contracts, setContracts] = useState<Contract[]>([
    { id: "1", name: "Master Service Agreement v3.0",    risk: "High",   issues: 4, issuesFixed: 2, saved: "Mar 18, 2026" },
    { id: "2", name: "NDA — Acme Corp",                  risk: "Low",    issues: 0, issuesFixed: 0, saved: "Mar 15, 2026" },
    { id: "3", name: "Vendor Agreement — SupplyCo",      risk: "Medium", issues: 2, issuesFixed: 1, saved: "Mar 10, 2026" },
    { id: "4", name: "Employment Contract — J. Daniels", risk: "Low",    issues: 1, issuesFixed: 1, saved: "Feb 28, 2026" },
    { id: "5", name: "SaaS Subscription Agreement",      risk: "High",   issues: 6, issuesFixed: 3, saved: "Feb 20, 2026" },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState("");

  function startEdit(contract: Contract) {
    setEditingId(contract.id);
    setEditName(contract.name);
  }

  function saveEdit(id: string) {
    setContracts(prev =>
      prev.map(c => c.id === id ? { ...c, name: editName } : c)
    );
    setEditingId(null);
  }

  function deleteContract(id: string) {
    setContracts(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className="px-8 py-10 space-y-8 max-w-[1200px]">
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
        <Button className="gap-2 shrink-0" onClick={() => setModalOpen(true)}>
          <Upload className="h-4 w-4" />
          Upload New Contract
        </Button>
        <UploadModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAnalyze={(files, contractType) => {
            console.log("Analyze:", files, contractType);
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
                <TableHead>Issues Fixed</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No saved contracts yet. Upload one to get started.
                  </TableCell>
                </TableRow>
              )}
              {contracts.map(contract => (
                <TableRow key={contract.id} className="h-16">
                  <TableCell className="pl-6 font-medium">
                    {editingId === contract.id ? (
                      <input
                        className="w-full rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(contract.id)}
                        autoFocus
                      />
                    ) : (
                      contract.name
                    )}
                  </TableCell>
                  <TableCell>
                    {contract.issuesFixed >= contract.issues && contract.issues > 0 ? (
                      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50">
                        No Risk
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          contract.risk === "High"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : contract.risk === "Medium"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }
                      >
                        {contract.risk}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contract.issues}</TableCell>
                  <TableCell className="text-muted-foreground">{contract.issuesFixed}</TableCell>
                  <TableCell className="text-muted-foreground">{contract.saved}</TableCell>
                  <TableCell className="pr-6 text-right">
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
