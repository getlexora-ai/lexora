"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import { cn } from "@/lib/utils";
import { PlaybookSelect } from "./playbook-select";
import type { CoverageRow, PlaybookRule, PlaybookSummary } from "./types";

const VERDICT_META: Record<
  CoverageRow["verdict"],
  { label: string; pill: string }
> = {
  meets: { label: "Covered", pill: "pill-low" },
  fallback: { label: "Covered (fallback)", pill: "pill-med" },
  redline: { label: "Redline by your playbook", pill: "pill-high" },
  missing: { label: "Not addressed", pill: "pill-none" },
};

export type CoverageListProps = {
  contractType?: string;
  /** Currently selected playbook id ("" = none). */
  playbookId: string;
  onPlaybookChange: (id: string) => void;
  /** Coverage rows from the last playbook-aware analysis, if any. */
  coverage?: CoverageRow[];
  /** Whether a re-analysis is in flight. */
  reanalysing?: boolean;
  onReanalyse: () => void;
  /** Jump to the Review tab and select the finding mapped to this rule. */
  onOpenFinding?: (ruleId: string) => void;
  /** Append the rule's preferred library clause to the document end. */
  onInsertPreferredClause?: (rule: PlaybookRule) => void;
};

export function CoverageList({
  contractType,
  playbookId,
  onPlaybookChange,
  coverage,
  reanalysing,
  onReanalyse,
  onOpenFinding,
  onInsertPreferredClause,
}: CoverageListProps) {
  const [playbook, setPlaybook] = useState<PlaybookSummary | null>(null);
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!playbookId) {
      setPlaybook(null);
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/playbooks/${playbookId}`);
      const d = await res.json();
      setPlaybook(d.playbook ?? null);
      setRules(d.rules ?? []);
    } catch {
      setPlaybook(null);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [playbookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verdictByRule = useMemo(() => {
    const m = new Map<string, CoverageRow["verdict"]>();
    for (const c of coverage ?? []) m.set(c.rule_id, c.verdict);
    return m;
  }, [coverage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <PlaybookSelect
          value={playbookId}
          contractType={contractType}
          onChange={(id) => onPlaybookChange(id)}
        />
        {playbook && <ApprovalBadge approved={playbook.is_approved} />}
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          disabled={!playbookId || reanalysing}
          onClick={onReanalyse}
        >
          {reanalysing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Re-analyse with this playbook
        </Button>
      </div>

      <p className="text-[12px] text-text-3">
        Lexora grades each clause against your playbook and applies it mechanically. It does
        not assess whether the positions are legally correct.
      </p>

      {loading ? (
        <div className="py-10 text-center text-text-3">
          <Loader2 className="mx-auto size-4 animate-spin" />
        </div>
      ) : !playbookId ? (
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-10 text-center text-[13px] text-text-3">
          Choose a playbook to see how this contract measures up.
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-10 text-center text-[13px] text-text-3">
          This playbook has no rules yet.
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rules.map((r, i) => {
            const verdict = verdictByRule.get(r.id);
            const meta = verdict ? VERDICT_META[verdict] : null;
            return (
              <li key={r.id} className="flex items-start gap-3 px-3.5 py-3">
                <span className="mt-0.5 font-mono text-[11px] tabular-nums text-text-3">
                  R{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{r.topic}</span>
                    <span className="pill pill-none text-[10px]">{r.severity}</span>
                    {r.is_required && (
                      <span className="pill pill-none text-[10px]">required</span>
                    )}
                    {meta ? (
                      <span className={cn("pill text-[10px]", meta.pill)}>
                        <i />
                        {meta.label}
                      </span>
                    ) : (
                      <span className="pill pill-none text-[10px]">Not analysed</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-text-3">
                    {r.unacceptable}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {verdict === "redline" && onOpenFinding && (
                    <Button size="xs" variant="ghost" onClick={() => onOpenFinding(r.id)}>
                      View <ArrowRight className="size-3" />
                    </Button>
                  )}
                  {verdict === "missing" && r.preferred_clause_id && onInsertPreferredClause && (
                    <Button size="xs" variant="ghost" onClick={() => onInsertPreferredClause(r)}>
                      <Plus className="size-3" /> Insert preferred clause
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
