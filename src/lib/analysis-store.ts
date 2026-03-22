export type RiskLevel = "high" | "medium" | "low";

// Field names match the Python server.py response format exactly
export type RiskClause = {
  id: string;
  type: RiskLevel;      // "high" | "medium" | "low"
  clause: string;       // clause title / section name
  issue: string;        // what is legally problematic (brief)
  passage: string;      // exact verbatim text from the document
  suggestion: string;   // complete ready-to-use replacement clause
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
