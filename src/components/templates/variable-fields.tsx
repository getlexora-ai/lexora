"use client";

import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { computeDerived } from "@/lib/templates/render";
import type { TemplateVariable } from "@/lib/contract-templates";
import { cn } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export type VariableValues = Record<string, string | number>;

type Props = {
  variables: TemplateVariable[];
  values: VariableValues;
  onChange: (key: string, value: string) => void;
  /** Variable keys the parent renders itself (e.g. modal's own party/rent fields). */
  hiddenKeys?: string[];
  className?: string;
};

/**
 * Renders a template's `variables` as a grouped form. `maps_to` variables can be
 * suppressed via `hiddenKeys` so a host that already has that field (the
 * create-contract modal) is not duplicated. Derived variables are shown
 * read-only with their live computed value.
 */
export function VariableFields({ variables, values, onChange, hiddenKeys = [], className }: Props) {
  const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const derived = useMemo(() => {
    try {
      return computeDerived(variables, values);
    } catch {
      return {} as Record<string, number>;
    }
  }, [variables, values]);

  const groups = useMemo(() => {
    const map = new Map<string, TemplateVariable[]>();
    for (const v of variables) {
      if (hidden.has(v.key)) continue;
      const g = v.group || "Details";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(v);
    }
    return [...map.entries()];
  }, [variables, hidden]);

  if (groups.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {groups.map(([group, vars]) => (
        <fieldset key={group} className="space-y-3">
          <legend className="text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
            {group}
          </legend>
          {vars.map((v) => {
            const raw = values[v.key];
            const strValue = raw === undefined || raw === null ? "" : String(raw);

            if (v.type === "derived") {
              const d = derived[v.key];
              return (
                <div key={v.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{v.label}</label>
                  <input
                    className={cn(INPUT_CLASS, "bg-muted/40 text-text-2")}
                    value={Number.isFinite(d) ? String(d) : ""}
                    readOnly
                    aria-describedby={`${v.key}-derived`}
                  />
                  <p id={`${v.key}-derived`} className="text-[11px] text-text-3 font-mono">
                    = {v.expr}
                  </p>
                </div>
              );
            }

            return (
              <div key={v.key} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {v.label}
                  {!v.required && (
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  )}
                </label>

                {v.type === "textarea" ? (
                  <textarea
                    className={cn(INPUT_CLASS, "resize-none")}
                    rows={3}
                    value={strValue}
                    onChange={(e) => onChange(v.key, e.target.value)}
                  />
                ) : v.type === "select" ? (
                  <Select value={strValue} onValueChange={(val) => onChange(v.key, val ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(v.options ?? []).map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    className={INPUT_CLASS}
                    type={v.type === "number" || v.type === "currency" ? "number" : v.type === "date" ? "date" : "text"}
                    inputMode={v.type === "currency" || v.type === "number" ? "decimal" : undefined}
                    min={v.type === "currency" || v.type === "number" ? "0" : undefined}
                    value={strValue}
                    onChange={(e) => onChange(v.key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
