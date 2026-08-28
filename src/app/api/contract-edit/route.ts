import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { instruction, currentDocument, history } =
      await req.json() as {
        instruction: string;
        currentDocument: string;
        history: { role: "user" | "assistant"; content: string }[];
      };

    const systemPrompt = `You are a senior commercial contracts attorney helping to draft and refine a legal contract.

The user will give you instructions to modify the contract. You must:
1. Apply the requested changes to the contract
2. Return the COMPLETE updated contract text (not just the changed section)
3. After the contract, write a brief explanation prefixed with "---EXPLANATION---" describing what you changed and why

Format your response exactly like this:
[complete updated contract text]
---EXPLANATION---
[1-2 sentences explaining what was changed]

Current contract:
${currentDocument}`;

    const text = await askLLM({
      system: systemPrompt,
      messages: [...(history ?? []), { role: "user", content: instruction }],
      maxTokens: 8192,
    });

    // Split on the explanation separator
    const parts       = text.split("---EXPLANATION---");
    const updatedDoc  = parts[0].trim();
    const explanation = parts[1]?.trim() ?? "Contract updated.";

    return NextResponse.json({ updatedDocument: updatedDoc, explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
