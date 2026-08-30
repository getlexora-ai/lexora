"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  BarChart, Bar,
  AreaChart, Area,
  LineChart, Line,
  XAxis, CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// --- Colors — the risk tokens, read live from CSS so the charts re-theme with
// the toggle instead of being frozen to one palette. Charts are client-rendered
// SVG, and var() resolves in SVG presentation attributes. ---
const DOCS_COLOR   = "var(--text-2)";
const FIXES_COLOR  = "var(--low)";
const HIGH_COLOR   = "var(--high)";
const MEDIUM_COLOR = "var(--med)";
const LOW_COLOR    = "var(--low)";

type DocEntry  = { month: string; docs: number };
type FixEntry  = { month: string; fixes: number };
type RiskEntry = { month: string; high: number; medium: number; low: number };

/** The slice of a contract the portfolio charts need. */
export type AnalyticsContract = {
  risk_level: "high" | "medium" | "low" | null;
  issues_fixed: number;
  created_at: string;
};

const docsConfig  = { docs:  { label: "Documents", color: DOCS_COLOR } };
const fixesConfig = { fixes: { label: "Suggestions applied", color: FIXES_COLOR } };
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

/**
 * Portfolio analytics over the last 6 calendar months, bucketed from real
 * contracts by created_at. issues_fixed is attributed to the month the
 * contract was created — the only timestamp these views carry.
 */
export function AnalyticsCharts({ contracts }: { contracts: AnalyticsContract[] }) {
  const currentRisk = {
    high:   contracts.filter(c => c.risk_level === "high").length,
    medium: contracts.filter(c => c.risk_level === "medium").length,
    low:    contracts.filter(c => c.risk_level === "low").length,
  };

  const { documentsData, fixesData, riskData } = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleString("en-US", { month: "short" }),
        docs: 0, fixes: 0, high: 0, medium: 0, low: 0,
      };
    });
    const byMonth = new Map(buckets.map(b => [b.key, b]));
    for (const c of contracts) {
      const d = new Date(c.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const b = byMonth.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (!b) continue; // outside the 6-month window
      b.docs  += 1;
      b.fixes += c.issues_fixed ?? 0;
      if (c.risk_level === "high")        b.high   += 1;
      else if (c.risk_level === "medium") b.medium += 1;
      else if (c.risk_level === "low")    b.low    += 1;
    }
    return {
      documentsData: buckets.map(({ month, docs }): DocEntry => ({ month, docs })),
      fixesData:     buckets.map(({ month, fixes }): FixEntry => ({ month, fixes })),
      riskData:      buckets.map(({ month, high, medium, low }): RiskEntry => ({ month, high, medium, low })),
    };
  }, [contracts]);

  return (
    <>
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
        title="Portfolio risk, last 6 months"
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
    </>
  );
}
