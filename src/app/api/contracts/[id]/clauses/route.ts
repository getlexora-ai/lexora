import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id]/clauses — list pending clauses for a contract
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const clauses = await query(
      `select id, type, clause, passage, issue, suggestion, refined_suggestion, status, sort_order
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
