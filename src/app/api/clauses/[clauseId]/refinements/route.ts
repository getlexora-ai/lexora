import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ clauseId: string }> };

// GET /api/clauses/[clauseId]/refinements — list all refinement attempts
export async function GET(_req: NextRequest, { params }: Params) {
  const { clauseId } = await params;

  try {
    const refinements = await query(
      `select id, user_note, refined_output, was_applied, created_at
         from clause_refinements
        where clause_id = $1
        order by created_at desc`,
      [clauseId],
    );
    return NextResponse.json({ refinements });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/clauses/[clauseId]/refinements — log a refinement attempt
export async function POST(req: NextRequest, { params }: Params) {
  const { clauseId } = await params;

  const { user_note, refined_output, was_applied } = await req.json() as {
    user_note: string;
    refined_output: string;
    was_applied?: boolean;
  };

  try {
    const row = await queryOne<{ id: string }>(
      `insert into clause_refinements (clause_id, user_note, refined_output, was_applied)
       values ($1, $2, $3, $4)
       returning id`,
      [clauseId, user_note, refined_output, was_applied ?? false],
    );
    return NextResponse.json({ id: row?.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
