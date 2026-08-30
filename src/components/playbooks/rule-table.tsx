"use client";

import { MoreVertical, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaybookRule } from "./types";

const SEV_PILL: Record<PlaybookRule["severity"], string> = {
  high: "pill-high",
  medium: "pill-med",
  low: "pill-low",
};

/**
 * The selected playbook's rules, in sort_order. Long-text fields are shown
 * truncated; clicking a row opens the RuleDrawer. Curated playbooks render
 * read-only (no add / edit affordances beyond viewing).
 */
export function RuleTable({
  rules,
  readOnly,
  onOpen,
  onAdd,
}: {
  rules: PlaybookRule[];
  readOnly?: boolean;
  onOpen: (rule: PlaybookRule) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-text-3">
          {rules.length} rule{rules.length === 1 ? "" : "s"}
        </p>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus className="size-4" /> Add rule
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Req.</TableHead>
              <TableHead>Acceptable</TableHead>
              <TableHead>Unacceptable</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-[13px] text-text-3">
                  No rules yet.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((r, i) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
                  <TableCell className="font-mono text-[11px] tabular-nums text-text-3">
                    R{i + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px] font-medium">
                    {r.topic}
                  </TableCell>
                  <TableCell>
                    <span className={cn("pill", SEV_PILL[r.severity])}>
                      <i />
                      {r.severity}
                    </span>
                  </TableCell>
                  <TableCell className="text-[12px] text-text-3">
                    {r.is_required ? "yes" : "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <span className="line-clamp-2 text-[12px] text-text-2">{r.acceptable}</span>
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <span className="line-clamp-2 text-[12px] text-text-2">{r.unacceptable}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[11px] text-text-3">
                    {r.reference ?? "—"}
                  </TableCell>
                  <TableCell>
                    <MoreVertical className="size-4 text-text-3" aria-hidden />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
