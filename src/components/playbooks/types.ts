// Shared client-side shapes for the playbooks UI. Mirrors src/lib/playbooks.ts
// (Playbook / PlaybookRuleRow) but without the server-only imports.

export type PlaybookSummary = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  contract_type: string;
  language: string;
  source: "curated" | "user";
  doc_ref: string | null;
  is_default: boolean;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  rule_count?: number;
  readonly?: boolean;
};

export type PlaybookRule = {
  id: string;
  playbook_id: string;
  clause_type: string;
  topic: string;
  acceptable: string;
  fallback: string | null;
  unacceptable: string;
  rationale: string | null;
  reference: string | null;
  preferred_clause_id: string | null;
  severity: "high" | "medium" | "low";
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CoverageRow = {
  rule_id: string;
  topic: string;
  severity: string;
  verdict: "meets" | "fallback" | "redline" | "missing";
};

export const SEVERITIES: PlaybookRule["severity"][] = ["high", "medium", "low"];
