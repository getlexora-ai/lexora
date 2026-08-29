"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
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

const CONTRACT_TYPES = [
  "NDA",
  "MSA",
  "Employment Contract",
  "SaaS Agreement",
  "Vendor Agreement",
  "Consulting Agreement",
  "Lease Agreement",
  "Partnership Agreement",
  "Service Agreement",
  "Other",
];

// The product is Germany-only — every contract is grounded in German law. The
// only user-facing choice is the language the draft is written in.
type Language = "en" | "de";
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

// A residential lease is drafted by the grounded RAG pipeline (src/lib/rag),
// which needs the flat's commercial terms. Jurisdiction is always Germany.
const GERMAN_LEASE_TYPE = "Lease Agreement";
const isGermanLease = (contractType: string) => contractType === GERMAN_LEASE_TYPE;

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (params: {
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
  }) => void;
  generating: boolean;
};

export function CreateContractModal({ open, onClose, onGenerate, generating }: Props) {
  const [name,         setName]         = useState("");
  const [contractType, setContractType] = useState("");
  const [party1,       setParty1]       = useState("");
  const [party2,       setParty2]       = useState("");
  const [language,     setLanguage]     = useState<Language>("de");
  const [keyTerms,     setKeyTerms]     = useState("");
  const [propertyAddress,   setPropertyAddress]   = useState("");
  const [baseRentEur,       setBaseRentEur]       = useState("");
  const [operatingCostsEur, setOperatingCostsEur] = useState("");
  const [depositEur,        setDepositEur]        = useState("");

  const germanLease = isGermanLease(contractType);
  const rentValue = Number(baseRentEur);
  const canGenerate =
    name.trim() && contractType && party1.trim() && party2.trim() &&
    (!germanLease || (propertyAddress.trim() && Number.isFinite(rentValue) && rentValue > 0));

  function handleSubmit() {
    if (!canGenerate) return;
    const num = (s: string) => {
      const n = Number(s);
      return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
    };
    onGenerate({
      name: name.trim(),
      contractType,
      party1: party1.trim(),
      party2: party2.trim(),
      language,
      keyTerms: keyTerms.trim(),
      ...(germanLease
        ? {
            propertyAddress: propertyAddress.trim(),
            baseRentEur: rentValue,
            operatingCostsEur: num(operatingCostsEur),
            depositEur: num(depositEur),
          }
        : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !generating) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            Generate Contract with AI
          </DialogTitle>
          <DialogDescription>
            Provide the details below and Claude will draft a complete contract for you to review and refine.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-1">
          {/* Contract name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contract Name</label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. NDA — Acme Corp"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Contract type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contract Type</label>
            <Select value={contractType} onValueChange={(v) => setContractType(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map(t => (
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
                onChange={e => setParty1(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{germanLease ? "Tenant (Mieter)" : "Party 2"}</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={germanLease ? "e.g. Ben Mieter" : "e.g. Global Ltd (Client)"}
                value={party2}
                onChange={e => setParty2(e.target.value)}
              />
            </div>
          </div>

          {/* Language — jurisdiction is always Germany; this only sets the
              language the draft is written in. */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Language</label>
            <Select value={language} onValueChange={(v) => setLanguage((v as Language) ?? "de")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(l => (
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
                  onChange={e => setPropertyAddress(e.target.value)}
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
                    onChange={e => setBaseRentEur(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Operating costs €/mo <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="number" min="0" inputMode="decimal"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Betriebskosten, e.g. 250"
                    value={operatingCostsEur}
                    onChange={e => setOperatingCostsEur(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Deposit € <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="number" min="0" inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Kaution — blank = statutory max (3× cold rent, § 551 BGB)"
                  value={depositEur}
                  onChange={e => setDepositEur(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Key terms */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Key Terms & Requirements <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="e.g. 2-year term, auto-renewal, liability cap at €50k, place of jurisdiction Berlin…"
              value={keyTerms}
              onChange={e => setKeyTerms(e.target.value)}
            />
          </div>

        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          {/* Default variant = graphite. Primary actions are never blue —
              brand is reserved for links and focus. */}
          <Button onClick={handleSubmit} disabled={!canGenerate || generating}>
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4" />Generate Contract</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
