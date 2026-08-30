import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { saveFromSuggestion } from "@/lib/clause-library";
import { isKnownTopic } from "@/lib/clause-taxonomy";

// POST /api/clause-library/from-suggestion — bank a clause from the review
// screen (an AI suggestion, a refined suggestion, or any selected text).
// Plain Postgres, no Gemini.
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const contractId = str(body.contractId);
  const title = str(body.title);
  const content = str(body.content);
  const clause_type = str(body.clause_type) || "sonstiges";

  if (!contractId || !title || !content) {
    return NextResponse.json(
      { error: "contractId, title and content are required" },
      { status: 400 },
    );
  }
  if (!(await ownsContract(contractId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const clause = await saveFromSuggestion(userId, {
      title,
      content,
      clause_type: isKnownTopic(clause_type) ? clause_type : "sonstiges",
      reference: str(body.reference) || null,
      summary: str(body.summary) || null,
    });
    return NextResponse.json({ clause }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
