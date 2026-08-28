import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { DEMO_USER_ID } from "@/lib/user";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id] — fetch contract + its clauses
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const contract = await queryOne(
      `select id, name, contract_type, extracted_text, quill_delta,
              risk_level, total_issues, issues_fixed, created_at
         from contracts
        where id = $1`,
      [id],
    );

    if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const risk_clauses = await query(
      `select id, type, clause, passage, issue, suggestion,
              refined_suggestion, status, sort_order, replaced_at
         from risk_clauses
        where contract_id = $1
        order by sort_order`,
      [id],
    );

    return NextResponse.json({ contract: { ...contract, risk_clauses } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/contracts/[id] — update name, quill_delta, issues_fixed
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const body = await req.json() as {
    name?: string;
    quill_delta?: object;
    issues_fixed?: number;
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (body.name         !== undefined) add("name", body.name);
  if (body.quill_delta  !== undefined) add("quill_delta", JSON.stringify(body.quill_delta));
  if (body.issues_fixed !== undefined) add("issues_fixed", body.issues_fixed);

  if (sets.length === 0) return NextResponse.json({ ok: true });

  values.push(id, DEMO_USER_ID);

  try {
    await query(
      `update contracts set ${sets.join(", ")}
        where id = $${values.length - 1} and user_id = $${values.length}`,
      values,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/contracts/[id] — hard delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await query(
      `delete from contracts where id = $1 and user_id = $2`,
      [id, DEMO_USER_ID],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
