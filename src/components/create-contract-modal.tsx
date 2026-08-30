"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, LayoutGrid } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VariableFields } from "@/components/templates/variable-fields";
import { CONTRACT_TYPES, isGermanLease } from "@/lib/contract-types";
import type { ContractTemplate } from "@/lib/contract-templates";

// The product is Germany-only — every contract is grounded in German law. The
// only user-facing choice is the language the draft is written in.
type Language = "en" | "de";
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

// maps_to targets the modal already has its own field for → don't duplicate.
const MODAL_BOUND = new Set([
  "landlord", "tenant", "propertyAddress", "baseRentEur", "operatingCostsEur", "depositEur",
]);

export type GenerateParams = {
  name: string;
  contractType: string;
  party1: string;
  party2: string;
  language: Language;
  keyTerms: string;
  propertyAddress?: string;
  baseRentEur?: number;
  operatingCostsEur?: number;
  depositEur?: number;
  /** Set when generating from a saved template. */
  templateId?: string;
  values?: Record<string, string | number>;
  /** true → instant render (no AI); false → generate with AI using the template as a constraint. */
  useRender?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (params: GenerateParams) => void;
  generating: boolean;
  /** Open straight on the "From template" step. */
  startFromTemplate?: boolean;
  /** Preselect this template (implies the template step). */
  initialTemplateId?: string;
};

export function CreateContractModal({
  open,
  onClose,
  onGenerate,
  generating,
  startFromTemplate,
  initialTemplateId,
}: Props) {
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [name, setName] = useState("");
  const [contractType, setContractType] = useState("");
  const [party1, setParty1] = useState("");
  const [party2, setParty2] = useState("");
  const [language, setLanguage] = useState<Language>("de");
  const [keyTerms, setKeyTerms] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [baseRentEur, setBaseRentEur] = useState("");
  const [operatingCostsEur, setOperatingCostsEur] = useState("");
  const [depositEur, setDepositEur] = useState("");

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateValues, setTemplateValues] = useState<Record<string, string | number>>({});

  const template = templates.find((t) => t.id === templateId) ?? null;

  // Reset + honour the entry point on every open transition. Calling setState
  // during render (guarded by a prev-value check) is the sanctioned React
  // pattern for "adjust state when a prop changes" — no effect, no cascade lint.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMode(startFromTemplate || initialTemplateId ? "template" : "blank");
      setTemplateId(initialTemplateId ?? "");
      setTemplateValues({});
    }
  }

  // Load templates once, on first open of the template step.
  useEffect(() => {
    if (!open || mode !== "template") return;
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setTemplates(d.templates ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, mode]);

  // A chosen template pins the contract type (derived — no effect needed).
  const effectiveContractType = mode === "template" && template ? template.contract_type : contractType;
  const germanLease = isGermanLease(effectiveContractType);
  const rentValue = Number(baseRentEur);
  const leaseOk = !germanLease || (propertyAddress.trim() && Number.isFinite(rentValue) && rentValue > 0);
  const baseOk = name.trim() && effectiveContractType && party1.trim() && party2.trim() && leaseOk;
  const canSubmit = mode === "template" ? baseOk && !!templateId : baseOk;

  const useRender = mode === "template" && !keyTerms.trim();

  function num(s: string) {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function handleSubmit() {
    if (!canSubmit) return;

    const leaseFields = germanLease
      ? {
          propertyAddress: propertyAddress.trim(),
          baseRentEur: rentValue,
          operatingCostsEur: num(operatingCostsEur),
          depositEur: num(depositEur),
        }
      : {};

    let values: Record<string, string | number> | undefined;
    if (mode === "template" && template) {
      values = { ...templateValues };
      for (const v of template.variables ?? []) {
        if (!v.maps_to || !MODAL_BOUND.has(v.maps_to)) continue;
        const bound =
          v.maps_to === "landlord" ? party1.trim()
          : v.maps_to === "tenant" ? party2.trim()
          : v.maps_to === "propertyAddress" ? propertyAddress.trim()
          : v.maps_to === "baseRentEur" ? (num(baseRentEur) ?? "")
          : v.maps_to === "operatingCostsEur" ? (num(operatingCostsEur) ?? "")
          : v.maps_to === "depositEur" ? (num(depositEur) ?? "")
          : "";
        if (bound !== "" && bound != null) values[v.key] = bound;
      }
    }

    onGenerate({
      name: name.trim(),
      contractType: effectiveContractType,
      party1: party1.trim(),
      party2: party2.trim(),
      language,
      keyTerms: keyTerms.trim(),
      ...leaseFields,
      ...(mode === "template" && templateId ? { templateId, values, useRender } : {}),
    });
  }

  const submitLabel = generating
    ? "Working…"
    : useRender
      ? "Use template"
      : mode === "template"
        ? "Generate with AI"
        : "Generate contract";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !generating) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            {mode === "template" ? "New contract from template" : "Generate a contract with AI"}
          </DialogTitle>
          <DialogDescription>
            {mode === "template"
              ? "Fill the template's fields. Leave “Key terms” empty to use it as-is, or add requirements to draft with AI."
              : "Add the details below and Claude drafts a full contract for you to review and refine."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-1">
          {/* Step 1 — Blank / From template */}
          <div className="seg" role="tablist" aria-label="Start from">
            <button
              type="button" role="tab" className="seg-btn"
              aria-selected={mode === "blank"}
              onClick={() => setMode("blank")}
            >
              Blank
            </button>
            <button
              type="button" role="tab" className="seg-btn"
              aria-selected={mode === "template"}
              onClick={() => setMode("template")}
            >
              <LayoutGrid className="mr-1 inline size-3.5" /> From template
            </button>
          </div>

          {mode === "template" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template</label>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v ?? ""); setTemplateValues({}); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.contract_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">No templates yet. Create one under Templates.</p>
              )}
            </div>
          )}

          {/* Contract name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contract name</label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. NDA for Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Contract type — locked to the template when one is chosen */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contract type</label>
            <Select
              value={effectiveContractType}
              onValueChange={(v) => setContractType(v ?? "")}
              disabled={mode === "template" && !!template}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{germanLease ? "Landlord (Vermieter)" : "Party 1"}</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={germanLease ? "e.g. Anna Vermieterin" : "e.g. Acme Corp (Provider)"}
                value={party1}
                onChange={(e) => setParty1(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{germanLease ? "Tenant (Mieter)" : "Party 2"}</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={germanLease ? "e.g. Ben Mieter" : "e.g. Global Ltd (Client)"}
                value={party2}
                onChange={(e) => setParty2(e.target.value)}
              />
            </div>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Language</label>
            <Select value={language} onValueChange={(v) => setLanguage((v as Language) ?? "de")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Grounded in German law either way. Deutsch keeps the contract in German;
              English keeps the German statutory citations.
            </p>
          </div>

          {/* German residential lease — grounded RAG drafting */}
          {germanLease && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                Grounded in German tenancy law (BGB §§ 535–577a, BetrKV, Mietpreisbremse).
                The draft cites the statutes it relies on.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Property address</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Musterstraße 12, 3. OG rechts, 10115 Berlin"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Net cold rent €/mo</label>
                  <input
                    type="number" min="0" inputMode="decimal"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Nettokaltmiete, e.g. 1200"
                    value={baseRentEur}
                    onChange={(e) => setBaseRentEur(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Operating costs €/mo <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="number" min="0" inputMode="decimal"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Betriebskosten, e.g. 250"
                    value={operatingCostsEur}
                    onChange={(e) => setOperatingCostsEur(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Deposit € <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="number" min="0" inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Kaution. Blank = statutory max (3× cold rent, § 551 BGB)"
                  value={depositEur}
                  onChange={(e) => setDepositEur(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Template-specific fields */}
          {mode === "template" && template && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <VariableFields
                variables={template.variables ?? []}
                values={templateValues}
                hiddenKeys={(template.variables ?? [])
                  .filter((v) => v.maps_to && MODAL_BOUND.has(v.maps_to))
                  .map((v) => v.key)}
                onChange={(key, value) => setTemplateValues((prev) => ({ ...prev, [key]: value }))}
              />
            </div>
          )}

          {/* Key terms */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Key terms and requirements <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder={mode === "template"
                ? "Leave empty to use the template as-is. Add requirements to redraft it with AI."
                : "e.g. 2-year term, auto-renewal, liability cap at €50k, place of jurisdiction Berlin…"}
              value={keyTerms}
              onChange={(e) => setKeyTerms(e.target.value)}
            />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || generating}>
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{submitLabel}</>
            ) : (
              <><Sparkles className="h-4 w-4" />{submitLabel}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
