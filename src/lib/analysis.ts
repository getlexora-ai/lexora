// Contract risk review. The product is Germany-only: every contract is assessed
// under German law (BGB — including AGB-Kontrolle §§ 305–310 — and the
// mietrechtliche Spezialnormen where the contract is a residential lease).
//
// `@/lib/llm` / `@/lib/errors` are imported dynamically inside `analyseContract`
// so the pure helpers below (prompt construction, `coerceIssues`) stay
// importable from plain `node --test` without a path-alias resolver.

export type Language = "en" | "de";

export type Issue = {
  passage: string;
  type: "high" | "medium" | "low";
  clause: string;
  issue: string;
  suggestion: string;
  /** The German statutory norm the finding relies on, e.g. "§ 307 BGB". */
  reference?: string;
};

/**
 * Build the reviewer prompt. The reviewer is a German Fachanwalt; findings must
 * cite the relevant norm. `language` only controls the language of `issue` /
 * `suggestion` — the legal frame is always German law.
 */
export function reviewPrompt(language: Language = "de"): string {
  const outLang = language === "en" ? "English" : "German (Deutsch)";
  return `You are a German Fachanwalt (senior specialist attorney) reviewing the contract below under GERMAN LAW.

Assess every clause against mandatory German law: the AGB-Kontrolle of §§ 305–310 BGB (including the Klauselverbote of §§ 308–309 BGB and the Generalklausel § 307 BGB), and — where the contract is a residential lease (Wohnraummietvertrag) — the mietrechtliche Spezialnormen (e.g. §§ 551, 556, 558, 573, 573c BGB, BetrKV). Identify 5-8 clauses that are void (unwirksam) or that unreasonably disadvantage one party (unangemessene Benachteiligung) under German law.

For each issue, write a COMPLETE, READY-TO-USE replacement clause in formal legal language — not advice, not a suggestion, but the actual sentence or paragraph that should replace the problematic text. It must be self-contained and legally precise, and compliant with German law.

Rules:
- passage must be copied verbatim from the document (max 80 chars)
- issue: what is legally problematic under German law, and it MUST cite the relevant norm inline, e.g. "Starre Fristen für Schönheitsreparaturen — unwirksam (§ 307 BGB, BGH)" (max 25 words)
- reference: the specific German norm(s) the finding relies on, e.g. "§ 309 Nr. 7 BGB" or "§ 551 Abs. 1 BGB" (short; leave empty only if genuinely none applies)
- suggestion must be a complete legal sentence or paragraph, not a fragment or instruction, and must keep German statutory citations in their German form
- Do not use phrases like 'consider', 'should be', 'it is recommended' — write the actual clause text
- Write the "issue" and "suggestion" text in ${outLang}
- Return 5-8 issues, most severe first

Document:
`;
}

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
          reference: { type: "string" },
        },
        required: ["passage", "type", "clause", "issue", "suggestion"],
      },
    },
  },
  required: ["issues"],
};

/** Pull a JSON object out of a model response even if it's fenced or has chatter. */
export function extractJson(raw: string): unknown {
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
export function coerceIssues(parsed: unknown): Issue[] {
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
    const reference = str(c.reference);
    let type = str(c.type).toLowerCase();
    if (!levels.has(type)) type = "medium";
    if (!passage || !clause || !suggestion) return [];
    return [{
      passage,
      type: type as Issue["type"],
      clause,
      issue,
      suggestion,
      ...(reference ? { reference } : {}),
    }];
  });
}

/**
 * Run the risk analysis over contract text under German law. Uses Gemini
 * structured output so the response is always valid JSON; retries once if the
 * model still returns nothing usable. Throws only when both attempts fail.
 *
 * `language` controls the language of the returned `issue` / `suggestion` text
 * (default "de"); the legal assessment is always German-law based.
 */
// ~200k chars ≈ 50k tokens — comfortably covers any real contract while
// bounding cost on a pathological upload. (Was a hard 20k-char cut before,
// which silently dropped everything past ~6 pages.)
const MAX_CHARS = 200_000;

export async function analyseContract(
  text: string,
  language: Language = "de",
): Promise<Issue[]> {
  const { askLLM } = await import("@/lib/llm");
  const { AppError } = await import("@/lib/errors");

  const prompt = reviewPrompt(language) + text.slice(0, MAX_CHARS);

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

  throw new AppError(
    422,
    "analysis_failed",
    "The analysis didn't produce a usable result. Please try again.",
  );
}
