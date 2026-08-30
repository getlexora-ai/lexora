// Contract risk review. The product is Germany-only: every contract is assessed
// under German law (BGB — including AGB-Kontrolle §§ 305–310 — and the
// mietrechtliche Spezialnormen where the contract is a residential lease).
//
// `@/lib/llm` / `@/lib/errors` are imported dynamically inside `analyseContract`
// so the pure helpers below (prompt construction, `coerceIssues`,
// `renderPlaybookBlock`, `coerceCoverage`) stay importable from plain
// `node --test` without a path-alias resolver.

export type Language = "en" | "de";

export type Issue = {
  passage: string;
  type: "high" | "medium" | "low";
  clause: string;
  issue: string;
  suggestion: string;
  /** The German statutory norm the finding relies on, e.g. "§ 307 BGB". */
  reference?: string;
  /** Wave 4: id of the playbook rule this finding breached (dropped if unknown). */
  rule_id?: string;
  /** Wave 4: how the clause scored against its rule. */
  verdict?: "meets" | "fallback" | "redline";
};

// ── Playbooks (Wave 4) ──────────────────────────────────────────────────────
// A playbook rule is one review position for a clause topic. Plain data — no DB
// types — so it can be constructed in a test and passed straight to
// `renderPlaybookBlock` / `reviewPrompt`.
export type PlaybookRule = {
  id: string;
  clause_type: string;
  topic: string;
  acceptable: string;
  fallback?: string;
  unacceptable: string;
  rationale?: string;
  reference?: string;
  severity: "high" | "medium" | "low";
  is_required: boolean;
};

/** One row of playbook coverage: the verdict the analysis reached for a rule. */
export type CoverageRow = {
  rule_id: string;
  topic: string;
  severity: string;
  verdict: "meets" | "fallback" | "redline" | "missing";
};

/**
 * Render the playbook as a `PRÜFMASSSTAB — PLAYBOOK` block for the reviewer
 * prompt. Pure and deterministic. Rules are tagged `R1..Rn` in input order
 * (`ruleIdForTag` maps a tag back to the rule id). When the block would exceed
 * `maxChars` the highest-index rules are dropped first and a truncation note is
 * appended.
 */
export function renderPlaybookBlock(rules: PlaybookRule[], maxChars = 12_000): string {
  const header =
    "PRÜFMASSSTAB — PLAYBOOK\n" +
    "Grade every clause against these positions. Where a clause is worse than " +
    "'unacceptable', flag it with the rule's severity and cite rule_id.";

  const clip = (s: string | undefined) => (typeof s === "string" ? s.trim() : "");

  const blockFor = (r: PlaybookRule, i: number): string => {
    const lines = [
      `[R${i + 1}] ${clip(r.topic) || r.clause_type} — severity: ${r.severity} — required: ${
        r.is_required ? "yes" : "no"
      }`,
      `    acceptable: ${clip(r.acceptable)}`,
    ];
    if (clip(r.fallback)) lines.push(`    fallback: ${clip(r.fallback)}`);
    lines.push(`    unacceptable: ${clip(r.unacceptable)}`);
    if (clip(r.rationale)) lines.push(`    rationale: ${clip(r.rationale)}`);
    return lines.join("\n");
  };

  const blocks = rules.map(blockFor);
  const assemble = (n: number, note = "") =>
    [header, ...blocks.slice(0, n)].join("\n\n") + note;

  let shown = blocks.length;
  let out = assemble(shown);
  while (shown > 0 && out.length > maxChars) {
    shown -= 1;
    out = assemble(
      shown,
      `\n\n… (playbook truncated: ${shown} of ${rules.length} rules shown)`,
    );
  }
  return out;
}

/** Map a `"R3"` tag from the model back to the rule id, or undefined. */
export function ruleIdForTag(rules: PlaybookRule[], tag: string): string | undefined {
  const m = /^R(\d+)$/i.exec(String(tag ?? "").trim());
  if (!m) return undefined;
  return rules[Number(m[1]) - 1]?.id;
}

/** Normalise a model-supplied rule reference (id or `"R3"` tag) to a rule id, or "". */
function resolveRuleId(raw: unknown, rules: PlaybookRule[], ids: Set<string>): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  if (/^R\d+$/i.test(v)) return ruleIdForTag(rules, v) ?? "";
  return ids.has(v) ? v : "";
}

/**
 * Build the reviewer prompt. The reviewer is a German Fachanwalt; findings must
 * cite the relevant norm. `language` only controls the language of `issue` /
 * `suggestion` — the legal frame is always German law.
 *
 * With `rules`, a `PRÜFMASSSTAB — PLAYBOOK` block is inserted between the rules
 * list and the `Document:` marker, and the "how many issues" instruction
 * switches to one-per-breached-rule. `reviewPrompt("de")` / `reviewPrompt()`
 * with no rules is byte-identical to the pre-Wave-4 string.
 */
export function reviewPrompt(language: Language = "de", rules?: PlaybookRule[]): string {
  const outLang = language === "en" ? "English" : "German (Deutsch)";
  const hasRules = Array.isArray(rules) && rules.length > 0;
  const returnLine = hasRules
    ? `- Return one issue per breached rule, most severe first; do not invent findings for rules that are met. Also still flag any clause that violates mandatory German law even if no rule covers it.`
    : `- Return 5-8 issues, most severe first`;
  const playbookBlock = hasRules ? `\n\n${renderPlaybookBlock(rules)}` : "";

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
${returnLine}${playbookBlock}

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
          // Wave 4 — set only when a playbook was supplied.
          rule_id: { type: "string" },
          verdict: { type: "string", enum: ["meets", "fallback", "redline"] },
        },
        required: ["passage", "type", "clause", "issue", "suggestion"],
      },
    },
    // Wave 4 — rules the reviewer judged absent from the contract entirely.
    missing_topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rule_id: { type: "string" },
          topic: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["rule_id"],
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

/**
 * Keep only well-formed issues; coerce `type` to a known risk level.
 *
 * With `rules`, an issue's `rule_id` (an id or an `"R3"` tag) is resolved to a
 * real rule id and carried through; a `rule_id` outside the supplied set is
 * dropped — the same defensive posture applied to `type`. `verdict` is carried
 * when it is one of meets/fallback/redline.
 */
export function coerceIssues(parsed: unknown, rules?: PlaybookRule[]): Issue[] {
  const arr = (parsed as { issues?: unknown })?.issues;
  if (!Array.isArray(arr)) return [];
  const levels = new Set(["high", "medium", "low"]);
  const verdicts = new Set(["meets", "fallback", "redline"]);
  const ruleList = rules ?? [];
  const ruleIds = new Set(ruleList.map((r) => r.id));

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

    // `rule_id` / `verdict` are playbook-only — ignored without a rule set.
    const rule_id = ruleList.length ? resolveRuleId(c.rule_id, ruleList, ruleIds) : "";
    let verdict = ruleList.length ? str(c.verdict).toLowerCase() : "";
    if (!verdicts.has(verdict)) verdict = "";

    return [{
      passage,
      type: type as Issue["type"],
      clause,
      issue,
      suggestion,
      ...(reference ? { reference } : {}),
      ...(rule_id ? { rule_id } : {}),
      ...(verdict ? { verdict: verdict as Issue["verdict"] } : {}),
    }];
  });
}

/**
 * Cross-reference the model's `issues` (their `rule_id` / `verdict`) and
 * `missing_topics` against `rules` and return one coverage row per rule. Pure.
 * A required rule with no matching finding is reported `missing`; a
 * non-required rule with no finding is `meets`.
 */
export function coerceCoverage(parsed: unknown, rules: PlaybookRule[]): CoverageRow[] {
  const p = parsed as { issues?: unknown; missing_topics?: unknown };
  const issues = Array.isArray(p?.issues) ? p.issues : [];
  const missing = Array.isArray(p?.missing_topics) ? p.missing_topics : [];
  const ruleIds = new Set(rules.map((r) => r.id));
  const rank = { meets: 0, fallback: 1, redline: 2 } as const;

  const byRule = new Map<string, "meets" | "fallback" | "redline">();
  for (const raw of issues) {
    const c = raw as Record<string, unknown>;
    const rid = resolveRuleId(c.rule_id, rules, ruleIds);
    if (!rid) continue;
    let v = (typeof c.verdict === "string" ? c.verdict.toLowerCase() : "") as
      | "meets" | "fallback" | "redline" | "";
    if (v !== "meets" && v !== "fallback" && v !== "redline") v = "redline";
    const prev = byRule.get(rid);
    if (!prev || rank[v] > rank[prev]) byRule.set(rid, v);
  }

  const missingRules = new Set<string>();
  for (const raw of missing) {
    const c = raw as Record<string, unknown>;
    const rid = resolveRuleId(c.rule_id, rules, ruleIds);
    if (rid) missingRules.add(rid);
  }

  return rules.map((r) => {
    let verdict: CoverageRow["verdict"];
    if (byRule.has(r.id)) verdict = byRule.get(r.id)!;
    else if (missingRules.has(r.id)) verdict = "missing";
    else if (r.is_required) verdict = "missing";
    else verdict = "meets";
    return { rule_id: r.id, topic: r.topic, severity: r.severity, verdict };
  });
}

/**
 * Run the risk analysis over contract text under German law. Uses Gemini
 * structured output so the response is always valid JSON; retries once if the
 * model still returns nothing usable. Throws only when both attempts fail.
 *
 * `opts` is a bare `Language` (legacy 2nd arg — kept for existing callers) or
 * `{ language?, rules? }`. With `rules`, the playbook block is added to the
 * prompt, the output-token cap is raised, and the input slice is shrunk by the
 * same amount so the total budget is unchanged. The no-`rules` path is
 * behaviourally identical to before Wave 4.
 */
// ~200k chars ≈ 50k tokens — comfortably covers any real contract while
// bounding cost on a pathological upload. (Was a hard 20k-char cut before,
// which silently dropped everything past ~6 pages.)
const MAX_CHARS = 200_000;
// Budget the playbook block borrows from the document slice when present.
const MAX_RULE_CHARS = 12_000;

type AnalyseOpts = { language?: Language; rules?: PlaybookRule[] };

function normaliseOpts(opts: AnalyseOpts | Language): { language: Language; rules?: PlaybookRule[] } {
  if (typeof opts === "string") return { language: opts === "en" ? "en" : "de" };
  return {
    language: opts?.language === "en" ? "en" : "de",
    rules: opts?.rules,
  };
}

export async function analyseContract(
  text: string,
  opts: AnalyseOpts | Language = "de",
): Promise<Issue[]> {
  const { language, rules } = normaliseOpts(opts);
  const hasRules = Array.isArray(rules) && rules.length > 0;

  const { askLLM } = await import("@/lib/llm");
  const { AppError } = await import("@/lib/errors");

  const budget = hasRules ? MAX_CHARS - MAX_RULE_CHARS : MAX_CHARS;
  const prompt = reviewPrompt(language, hasRules ? rules : undefined) + text.slice(0, budget);
  const maxTokens = hasRules ? 12288 : 8192;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let responseText: string;
    try {
      responseText = await askLLM({
        maxTokens,
        prompt,
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      if (attempt === 2) throw err;
      continue;
    }

    try {
      const issues = coerceIssues(extractJson(responseText), hasRules ? rules : undefined);
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

/**
 * Playbook-aware analysis: same LLM call as `analyseContract` with `rules`, but
 * also returns per-rule coverage. Unlike `analyseContract`, an empty `issues`
 * array is a valid result here (it means no rule was breached), so it only
 * retries on a transport error or an unparseable response.
 */
export async function analyseContractWithPlaybook(
  text: string,
  { language = "de", rules }: { language?: Language; rules: PlaybookRule[] },
): Promise<{ issues: Issue[]; coverage: CoverageRow[] }> {
  const { askLLM } = await import("@/lib/llm");
  const { AppError } = await import("@/lib/errors");

  const lang: Language = language === "en" ? "en" : "de";
  const prompt = reviewPrompt(lang, rules) + text.slice(0, MAX_CHARS - MAX_RULE_CHARS);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let responseText: string;
    try {
      responseText = await askLLM({
        maxTokens: 12288,
        prompt,
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      if (attempt === 2) throw err;
      continue;
    }

    try {
      const parsed = extractJson(responseText);
      return {
        issues: coerceIssues(parsed, rules),
        coverage: coerceCoverage(parsed, rules),
      };
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
