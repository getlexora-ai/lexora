"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlaybookSummary } from "./types";

/**
 * A thin <Select> over GET /api/playbooks. Used on the review screen's Playbook
 * tab and (later) anywhere a playbook has to be picked. `value === ""` means
 * "no playbook".
 */
export function PlaybookSelect({
  value,
  onChange,
  contractType,
  includeNone = true,
  className,
}: {
  value: string;
  onChange: (id: string, playbook: PlaybookSummary | null) => void;
  contractType?: string;
  includeNone?: boolean;
  className?: string;
}) {
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (contractType) sp.set("contract_type", contractType);
    fetch(`/api/playbooks?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setPlaybooks(d.playbooks ?? []))
      .catch(() => setPlaybooks([]));
  }, [contractType]);

  return (
    <Select
      value={value || "__none"}
      onValueChange={(v) => {
        const id = !v || v === "__none" ? "" : v;
        onChange(id, playbooks.find((p) => p.id === id) ?? null);
      }}
    >
      <SelectTrigger className={className ?? "w-[280px]"}>
        <SelectValue placeholder="Choose a playbook" />
      </SelectTrigger>
      <SelectContent>
        {includeNone && <SelectItem value="__none">No playbook</SelectItem>}
        {playbooks.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.is_default ? " · default" : ""}
            {p.source === "curated" ? " · curated" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
