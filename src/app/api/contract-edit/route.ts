import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { parseEditReply } from "@/lib/contract-edit-reply";

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

    // `currentDocument` may legitimately be empty — the create flow's first
    // message ("draft a SaaS agreement…") starts from a blank editor.
    if (!instruction?.trim()) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }
    const doc = currentDocument ?? "";

    const systemPrompt = `You are a senior commercial contracts attorney working alongside the user on a live contract inside an editor.

The contract is written in Markdown: \`#\`/\`##\`/\`###\` headings (often \`### § 1 …\`), \`**bold**\` for defined terms and party names, \`-\` and \`1.\` lists, \`---\` rules, and blank lines between clauses.

Every message from the user is one of two things:
- A QUESTION about the contract → answer it. Do NOT change the document.
- An INSTRUCTION to change the contract (reword, reformat, add/remove/renumber a clause, "make it cleaner", etc.) → apply the change to the whole document.

If the message could be either, prefer answering and ask what they want changed.

Reply in EXACTLY this format, including the separator lines:

---MODE---
answer
---ANSWER---
<your answer to their question, OR — when MODE is edit — 1 to 3 sentences describing what you changed and why>
---DOCUMENT---
<only when MODE is edit: the COMPLETE updated contract in the SAME Markdown format — every heading, bold span, list, rule and blank line you were not explicitly asked to change must be preserved exactly. Never return a fragment. Never flatten the Markdown to plain text.>

When MODE is \`answer\`, set the MODE line to \`answer\` and STOP after the ANSWER section — do not write the ---DOCUMENT--- line at all.
When MODE is \`edit\`, set the MODE line to \`edit\` and include the full document.

Current contract:
${doc || "(empty — the user is starting a new contract from scratch)"}`;

    const text = await askLLM({
      system: systemPrompt,
      messages: [...(history ?? []), { role: "user", content: instruction }],
      // Matches the rest of the app. A rewrite that overruns this is caught by
      // parseEditReply's length guard and served as an answer, not applied.
      maxTokens: 8192,
    });

    const parsed = parseEditReply(text, doc.length);

    return NextResponse.json({
      mode: parsed.mode,
      answer: parsed.answer,
      ...(parsed.mode === "edit" && parsed.document
        ? { updatedDocument: parsed.document }
        : {}),
    });
  } catch (err) {
    return errorResponse(err, "contract-edit");
  }
}
