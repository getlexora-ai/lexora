import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "contract-edit");
    if (limited) return limited;

    const { instruction, currentDocument, history } =
      await req.json() as {
        instruction: string;
        currentDocument: string;
        history: { role: "user" | "assistant"; content: string }[];
      };

    const systemPrompt = `You are a senior commercial contracts attorney helping to draft and refine a legal contract.

The contract is written in Markdown: \`#\`/\`##\`/\`###\` headings (often \`### § 1 …\`), \`**bold**\` for defined terms and party names, \`-\` and \`1.\` lists, \`---\` rules, and blank lines between clauses.

The user will give you instructions to modify the contract. You must:
1. Apply the requested changes to the contract
2. Return the COMPLETE updated contract (not just the changed section) in the SAME Markdown format — preserve every heading, bold span, list, rule, and blank line you were not explicitly asked to change. Never flatten the Markdown to plain text.
3. After the contract, write a brief explanation prefixed with "---EXPLANATION---" describing what you changed and why

Format your response exactly like this:
[complete updated contract in Markdown]
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
    return errorResponse(err, "contract-edit");
  }
}
