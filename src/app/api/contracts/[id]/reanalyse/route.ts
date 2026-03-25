import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RiskClause } from "@/lib/analysis-store";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { text } = await req.json() as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  // Run AI analysis
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: REVIEW_PROMPT + text.slice(0, 20000) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    return NextResponse.json({ error: "Unexpected Claude response type" }, { status: 500 });
  }

  const raw = content.text
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

  // Delete all existing pending clauses for this contract
  await supabase
    .from("risk_clauses")
    .delete()
    .eq("contract_id", id)
    .eq("status", "pending");

  // Insert new clauses
  const rows = issues.map((c, i) => ({
    contract_id: id,
    type: c.type,
    clause: c.clause,
    passage: c.passage,
    issue: c.issue,
    suggestion: c.suggestion,
    sort_order: i,
    status: "pending" as const,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("risk_clauses")
    .insert(rows)
    .select("id, type, clause, passage, issue, suggestion, sort_order");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Update total_issues on the contract
  await supabase
    .from("contracts")
    .update({ total_issues: issues.length, issues_fixed: 0 })
    .eq("id", id);

  const clauses: RiskClause[] = (inserted ?? [])
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
