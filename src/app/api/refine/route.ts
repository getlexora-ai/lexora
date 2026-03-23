import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { passage, currentSuggestion, userNote, contractText } =
      await req.json() as {
        passage: string;
        currentSuggestion: string;
        userNote: string;
        contractText: string;
      };

    if (!passage || !currentSuggestion || !userNote) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const prompt = `You are a senior commercial contracts attorney.

A clause in a contract has been flagged as risky. An AI already suggested a replacement clause, but the user wants it refined based on their specific context.

ORIGINAL PROBLEMATIC PASSAGE:
"${passage}"

CURRENT AI SUGGESTION:
"${currentSuggestion}"

USER'S REFINEMENT REQUEST:
"${userNote}"

CONTRACT CONTEXT (first 8000 chars):
${contractText.slice(0, 8000)}

Write a NEW replacement clause that incorporates the user's request. Return ONLY the replacement clause text — no explanation, no preamble, no quotes. Write it in formal legal language, ready to insert verbatim into the contract.`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type" }, { status: 500 });
    }

    return NextResponse.json({ refined: content.text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
