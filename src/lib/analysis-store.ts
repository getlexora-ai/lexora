export type RiskLevel = "high" | "medium" | "low";

// Field names match the Python server.py response format exactly
export type RiskClause = {
  id: string;
  type: RiskLevel;      // "high" | "medium" | "low"
  clause: string;       // clause title / section name
  issue: string;        // what is legally problematic (brief)
  passage: string;      // exact verbatim text from the document
  suggestion: string;   // complete ready-to-use replacement clause
  source?: "ai" | "user"; // "user" when the reviewer added it as a missed clause
  // Wave 4 (playbooks) — present only when the analysis ran against a playbook.
  reference?: string;             // German norm the finding relies on ("§ 307 BGB")
  playbook_rule_id?: string;      // the playbook rule this finding breached
  verdict?: "meets" | "fallback" | "redline";
  // Guardrails (db/009) — 'compliance' = void / statutory defect, 'negotiation'
  // = playbook-position redline, 'info' = reserved. Set from the guardrail
  // engine, not the model.
  category?: "compliance" | "negotiation" | "info";
};

export type AnalysisResult = {
  extractedText: string;
  clauses: RiskClause[];
};

let _result: AnalysisResult | null = null;

export const analysisStore = {
  set(r: AnalysisResult) { _result = r; },
  get(): AnalysisResult | null { return _result; },
  clear() { _result = null; },
};
