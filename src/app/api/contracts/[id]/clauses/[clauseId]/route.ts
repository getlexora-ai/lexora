import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string; clauseId: string }> };

// PATCH /api/contracts/[id]/clauses/[clauseId]
// Update clause status (replaced/dismissed) or save a refined suggestion
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, clauseId } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    status?: "replaced" | "dismissed";
    refined_suggestion?: string;
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (body.status             !== undefined) add("status", body.status);
  if (body.refined_suggestion !== undefined) add("refined_suggestion", body.refined_suggestion);
  if (body.status === "replaced")            add("replaced_at", new Date().toISOString());

  if (sets.length === 0) return NextResponse.json({ ok: true });

  values.push(clauseId, id);

  try {
    await query(
      `update risk_clauses set ${sets.join(", ")}
        where id = $${values.length - 1} and contract_id = $${values.length}`,
      values,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
