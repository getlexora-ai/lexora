import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
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

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
    }

    return NextResponse.json({ text: content.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
