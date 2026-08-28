import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "chat");
    if (limited) return limited;

    const { question, contractText, history } =
      await req.json() as { question: string; contractText: string; history: Message[] };

    if (!question || !contractText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const systemPrompt = `You are a senior commercial contracts attorney reviewing the following contract. Answer questions concisely and clearly. When quoting from the contract, use short relevant excerpts. If something is legally risky, say so directly.

CONTRACT:
${contractText.slice(0, 20000)}`;

    const answer = await askLLM({
      system: systemPrompt,
      messages: [...(history ?? []), { role: "user", content: question }],
      maxTokens: 2048,
    });

    return NextResponse.json({ answer });
  } catch (err) {
    return errorResponse(err, "chat");
  }
}
