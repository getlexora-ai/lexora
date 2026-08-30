"use client";

import { useEffect, useState } from "react";
import { RdgNoticeBar } from "@/components/rdg-notice";
import { AnalyticsCharts, type AnalyticsContract } from "@/components/dashboard/analytics-charts";

export default function RiskDashboardPage() {
  const [contracts, setContracts] = useState<AnalyticsContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contracts");
        if (res.ok) {
          const { contracts } = await res.json();
          setContracts(contracts ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
      <RdgNoticeBar />

      <section>
        <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Risk dashboard</h1>
        <p className="mt-1 text-[13px] text-text-2">
          Portfolio analytics across your contracts, last 6 months.
        </p>
      </section>

      {loading ? (
        <p className="text-[13px] text-text-3">Loading…</p>
      ) : (
        <AnalyticsCharts contracts={contracts} />
      )}
    </div>
  );
}
