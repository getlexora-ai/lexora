"use client";

import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import { cn } from "@/lib/utils";
import type { PlaybookSummary } from "./types";

/** Left rail: one Card per visible playbook. */
export function PlaybookList({
  playbooks,
  selectedId,
  onSelect,
}: {
  playbooks: PlaybookSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {playbooks.map((p) => (
        <Card
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={cn(
            "cursor-pointer gap-1.5 p-3 transition-colors",
            selectedId === p.id
              ? "border-[var(--accent-line)] bg-[var(--accent-wash)]"
              : "hover:bg-surface-2",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-semibold leading-snug">{p.name}</span>
            {p.is_default && (
              <span title="Default for this contract type">
                <Star className="size-3.5 shrink-0 fill-current text-text-3" aria-hidden />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ApprovalBadge approved={p.is_approved} />
            <span className="pill pill-none text-[10px]">
              {p.source === "curated" ? "Curated" : "Mine"}
            </span>
            {p.contract_type ? (
              <span className="pill pill-none text-[10px]">{p.contract_type}</span>
            ) : (
              <span className="pill pill-none text-[10px]">Any type</span>
            )}
            {typeof p.rule_count === "number" && (
              <span className="text-[11px] text-text-3">{p.rule_count} rules</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
