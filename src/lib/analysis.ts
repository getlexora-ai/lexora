import { askLLM } from "@/lib/llm";

export type Issue = {
  passage: string;
  type: "high" | "medium" | "low";
  clause: string;
  issue: string;
  suggestion: string;
};

const REVIEW_PROMPT = `You are a senior commercial contracts attorney. Review the contract below and identify 5-8 risky or non-standard clauses.

For each issue, write a COMPLETE, READY-TO-USE replacement clause in formal legal language — not advice, not a suggestion, but the actual sentence or paragraph that should replace the problematic text. It must be self-contained and legally precise.

Rules:
- passage must be copied verbatim from the document (max 80 chars)
- issue: what is legally problematic (max 15 words)
- suggestion must be a complete legal sentence or paragraph, not a fragment or instruction
- Do not use phrases like 'consider', 'should be', 'it is recommended' — write the actual clause text
- Return 5-8 issues, most severe first

Document:
`;

// Gemini structured-output schema — forces a parseable JSON object back.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          passage: { type: "string" },
          type: { type: "string", enum: ["high", "medium", "low"] },
          clause: { type: "string" },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["passage", "type", "clause", "issue", "suggestion"],
      },
    },
  },
  required: ["issues"],
};

/** Pull a JSON object out of a model response even if it's fenced or has chatter. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    // Salvage: take from the first "{" to the last "}".
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("no JSON object found");
  }
}

/** Keep only well-formed issues; coerce `type` to a known risk level. */
function coerceIssues(parsed: unknown): Issue[] {
  const arr = (parsed as { issues?: unknown })?.issues;
  if (!Array.isArray(arr)) return [];
  const levels = new Set(["high", "medium", "low"]);
  return arr.flatMap((raw): Issue[] => {
    const c = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const passage = str(c.passage);
    const clause = str(c.clause);
    const issue = str(c.issue);
    const suggestion = str(c.suggestion);
    let type = str(c.type).toLowerCase();
    if (!levels.has(type)) type = "medium";
    if (!passage || !clause || !suggestion) return [];
    return [{ passage, type: type as Issue["type"], clause, issue, suggestion }];
  });
}

/**
 * Run the risk analysis over contract text. Uses Gemini structured output so the
 * response is always valid JSON; retries once if the model still returns nothing
 * usable. Throws only when both attempts fail.
 */
// ~200k chars ≈ 50k tokens — comfortably covers any real contract while
// bounding cost on a pathological upload. (Was a hard 20k-char cut before,
// which silently dropped everything past ~6 pages.)
const MAX_CHARS = 200_000;

export async function analyseContract(text: string): Promise<Issue[]> {
  const prompt = REVIEW_PROMPT + text.slice(0, MAX_CHARS);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let responseText: string;
    try {
      responseText = await askLLM({
        maxTokens: 8192,
        prompt,
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      if (attempt === 2) throw err;
      continue;
    }

    try {
      const issues = coerceIssues(extractJson(responseText));
      if (issues.length > 0) return issues;
    } catch {
      // fall through to retry
    }
  }

  throw new Error("Analysis did not return any usable clauses");
}
