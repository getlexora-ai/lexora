"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
type DocEntry   = { month: string; docs: number };
type FixEntry   = { month: string; fixes: number };
type RiskEntry  = { month: string; high: number; medium: number; low: number };

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
        <Button className="gap-2 shrink-0">
          <Upload className="h-4 w-4" />
          Upload New Contract
        </Button>
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
    </div>
  );
}
