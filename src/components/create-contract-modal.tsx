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

const JURISDICTIONS = ["UK", "US", "EU", "India", "Australia", "Singapore", "Global"];

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (params: {
    name: string;
    contractType: string;
    party1: string;
    party2: string;
    jurisdiction: string;
    keyTerms: string;
  }) => void;
  generating: boolean;
};

export function CreateContractModal({ open, onClose, onGenerate, generating }: Props) {
  const [name,         setName]         = useState("");
  const [contractType, setContractType] = useState("");
  const [party1,       setParty1]       = useState("");
  const [party2,       setParty2]       = useState("");
  const [jurisdiction, setJurisdiction] = useState("UK");
  const [keyTerms,     setKeyTerms]     = useState("");

  const canGenerate = name.trim() && contractType && party1.trim() && party2.trim();

  function handleSubmit() {
    if (!canGenerate) return;
    onGenerate({ name: name.trim(), contractType, party1: party1.trim(), party2: party2.trim(), jurisdiction, keyTerms: keyTerms.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !generating) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            Generate Contract with AI
          </DialogTitle>
          <DialogDescription>
            Provide the details below and Claude will draft a complete contract for you to review and refine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
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
              <label className="text-sm font-medium">Party 1</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. Acme Corp (Provider)"
                value={party1}
                onChange={e => setParty1(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Party 2</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. Global Ltd (Client)"
                value={party2}
                onChange={e => setParty2(e.target.value)}
              />
            </div>
          </div>

          {/* Jurisdiction */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jurisdiction</label>
            <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v ?? "UK")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTIONS.map(j => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Key terms */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Key Terms & Requirements <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="e.g. 2-year term, auto-renewal, liability cap at £50k, UK law applies…"
              value={keyTerms}
              onChange={e => setKeyTerms(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
