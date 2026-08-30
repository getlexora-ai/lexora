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
- An INSTRUCTION to change the contract → apply it.

If the message could be either, prefer answering and ask what they want changed.

For a change, choose ONE of two formats:

1. TARGETED EDITS — the normal case, for changes that touch specific clauses,
   sentences or phrases (reword a clause, change a number, rename a party,
   delete a sentence, insert a paragraph after another). Return a JSON array of
   edits. Each \`find\` MUST be copied VERBATIM from the current contract,
   including its exact punctuation and capitalisation, and long enough to occur
   exactly once. \`replace\` is the new text (use "" to delete). Keep the number
   of edits small and precise — do not restate unchanged text.

2. FULL REWRITE — only when the change genuinely spans the whole document
   (reformat everything, renumber every section, change a style rule
   throughout). Return the COMPLETE updated contract in the same Markdown
   format; preserve every heading, bold span, list, rule and blank line you
   were not asked to change.

Reply in EXACTLY this format:

---MODE---
edit
---ANSWER---
<1 to 3 sentences describing what you changed and why>
---CHANGES---
[{ "find": "...", "replace": "...", "note": "short label" }]

…OR, for a full rewrite, replace the ---CHANGES--- section with:

---DOCUMENT---
<complete updated contract in Markdown>

For a QUESTION, set MODE to \`answer\`, write only the ---ANSWER--- section, and
stop — no ---CHANGES--- or ---DOCUMENT--- line.

Current contract:
${doc || "(empty — the user is starting a new contract from scratch)"}`;

    const text = await askLLM({
      system: systemPrompt,
      messages: [...(history ?? []), { role: "user", content: instruction }],
      // Matches the rest of the app. A full rewrite that overruns this is caught
      // by parseEditReply's length guard and served as an answer, not applied.
      maxTokens: 8192,
    });

    const parsed = parseEditReply(text, doc.length);

    return NextResponse.json({
      mode: parsed.mode,
      answer: parsed.answer,
      ...(parsed.changes ? { changes: parsed.changes } : {}),
      ...(parsed.document ? { updatedDocument: parsed.document } : {}),
    });
  } catch (err) {
    return errorResponse(err, "contract-edit");
  }
}
