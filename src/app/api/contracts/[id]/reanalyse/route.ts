import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { query } from "@/lib/db";
import { RiskClause } from "@/lib/analysis-store";

const REVIEW_PROMPT = `You are a senior commercial contracts attorney. Review the contract below and identify 5-8 risky or non-standard clauses.

For each issue, write a COMPLETE, READY-TO-USE replacement clause in formal legal language — not advice, not a suggestion, but the actual sentence or paragraph that should replace the problematic text. It must be self-contained and legally precise.

Return ONLY a JSON block in this exact format:
\`\`\`json
{
  "issues": [
    {
      "passage": "exact verbatim text from the document to be replaced (max 80 chars)",
      "type": "high|medium|low",
      "clause": "Clause title / section name",
      "issue": "what is legally problematic (max 15 words)",
      "suggestion": "The complete replacement clause in formal legal language, ready to insert verbatim into the contract."
    }
  ]
}
\`\`\`

Rules:
- passage must be copied verbatim from the document
- suggestion must be a complete legal sentence or paragraph, not a fragment or instruction
- Do not use phrases like 'consider', 'should be', 'it is recommended' — write the actual clause text
- Include 5-8 issues max

Document:
`;

type Params = { params: Promise<{ id: string }> };

// POST /api/contracts/[id]/reanalyse — re-run AI analysis on current document text
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const { text } = await req.json() as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  // Run AI analysis
  let responseText: string;
  try {
    responseText = await askLLM({
      maxTokens: 8192,
      prompt: REVIEW_PROMPT + text.slice(0, 20000),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const raw = responseText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: { issues: Omit<RiskClause, "id">[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response", raw }, { status: 500 });
  }

  const issues = parsed.issues ?? [];

  let inserted: Array<{
    id: string; type: string; clause: string; passage: string;
    issue: string; suggestion: string; sort_order: number;
  }> = [];

  try {
    // Delete all existing pending clauses for this contract
    await query(
      `delete from risk_clauses where contract_id = $1 and status = 'pending'`,
      [id],
    );

    // Insert new clauses
    if (issues.length > 0) {
      const rows: string[] = [];
      const values: unknown[] = [];
      issues.forEach((c, i) => {
        const b = i * 8;
        rows.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`,
        );
        values.push(id, c.type, c.clause, c.passage, c.issue, c.suggestion, i, "pending");
      });

      inserted = await query(
        `insert into risk_clauses
           (contract_id, type, clause, passage, issue, suggestion, sort_order, status)
         values ${rows.join(", ")}
         returning id, type, clause, passage, issue, suggestion, sort_order`,
        values,
      );
    }

    // Update total_issues on the contract
    await query(
      `update contracts set total_issues = $1, issues_fixed = 0 where id = $2`,
      [issues.length, id],
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const clauses: RiskClause[] = inserted
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      id: c.id,
      type: c.type as RiskClause["type"],
      clause: c.clause,
      passage: c.passage,
      issue: c.issue,
      suggestion: c.suggestion,
    }));

  return NextResponse.json({ clauses });
}
