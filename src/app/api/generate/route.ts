import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "generate");
    if (limited) return limited;

    const { contractType, party1, party2, jurisdiction, keyTerms } =
      await req.json() as {
        contractType: string;
        party1: string;
        party2: string;
        jurisdiction: string;
        keyTerms?: string;
      };

    const prompt = `You are a senior commercial contracts attorney. Draft a complete, professional ${contractType} between ${party1} and ${party2} governed by ${jurisdiction} law.

${keyTerms ? `Key requirements from the client:\n${keyTerms}\n` : ""}

Requirements:
- Write the full contract with all standard sections for this contract type
- Use formal legal language appropriate for ${jurisdiction} jurisdiction
- Include all standard clauses (definitions, obligations, term, termination, liability, governing law, etc.)
- Make it ready to use — no placeholders like [INSERT], use reasonable standard terms
- Format with numbered sections and clear headings
- Return ONLY the contract text, no preamble or explanation

Write the complete contract now:`;

    const text = await askLLM({ prompt, maxTokens: 8192 });

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
