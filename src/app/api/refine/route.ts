import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "refine");
    if (limited) return limited;

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

    const refined = await askLLM({ prompt, maxTokens: 2048 });

    return NextResponse.json({ refined: refined.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
