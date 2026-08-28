import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string; clauseId: string }> };

// POST /api/contracts/[id]/clauses/[clauseId]/refinements
// Saves a refinement attempt (user note + Claude output) to clause_refinements table
export async function POST(req: NextRequest, { params }: Params) {
  const { id, clauseId } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    user_note: string;
    refined_output: string;
    was_applied?: boolean;
  };

  if (!body.user_note || !body.refined_output) {
    return NextResponse.json({ error: "user_note and refined_output are required" }, { status: 400 });
  }

  try {
    await query(
      `insert into clause_refinements (clause_id, user_note, refined_output, was_applied)
       values ($1, $2, $3, $4)`,
      [clauseId, body.user_note, body.refined_output, body.was_applied ?? false],
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
