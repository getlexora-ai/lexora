import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { RiskClause } from "@/lib/analysis-store";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Matches the REVIEW_PROMPT in server.py exactly
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

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json() as { text: string };
    if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: REVIEW_PROMPT + text.slice(0, 20000) }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected Claude response type" }, { status: 500 });
    }

    // Strip markdown fences if present
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

    const clauses: RiskClause[] = (parsed.issues ?? []).map((c, i) => ({
      ...c,
      id: `clause-${i}-${Date.now()}`,
    }));

    return NextResponse.json({ clauses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
