import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id]/clauses — list pending clauses (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const clauses = await query(
      `select id, type, clause, passage, issue, suggestion, refined_suggestion, status, source, sort_order
         from risk_clauses
        where contract_id = $1
        order by sort_order`,
      [id],
    );
    return NextResponse.json({ clauses });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/contracts/[id]/clauses — user adds a clause the AI missed (owner only)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    type?: "high" | "medium" | "low";
    clause?: string;
    passage?: string;
    issue?: string;
    suggestion?: string;
  };

  const type = body.type;
  const clause = body.clause?.trim();
  const passage = body.passage?.trim();
  const issue = body.issue?.trim();
  const suggestion = body.suggestion?.trim();

  if (
    !type || !["high", "medium", "low"].includes(type) ||
    !clause || !passage || !issue || !suggestion
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const row = await queryOne<{
      id: string; type: string; clause: string; passage: string;
      issue: string; suggestion: string; refined_suggestion: string | null;
      status: string; source: string; sort_order: number;
    }>(
      `insert into risk_clauses
         (contract_id, type, clause, passage, issue, suggestion, status, source, sort_order)
       values (
         $1, $2, $3, $4, $5, $6, 'pending', 'user',
         (select coalesce(max(sort_order), -1) + 1 from risk_clauses where contract_id = $1)
       )
       returning id, type, clause, passage, issue, suggestion,
                 refined_suggestion, status, source, sort_order`,
      [id, type, clause, passage, issue, suggestion],
    );

    if (!row) {
      return NextResponse.json({ error: "Failed to add clause" }, { status: 500 });
    }

    await query(
      `update contracts set total_issues = total_issues + 1 where id = $1`,
      [id],
    );

    return NextResponse.json({ clause: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
