import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string; clauseId: string }> };

// PATCH /api/contracts/[id]/clauses/[clauseId]
// Update clause status (replaced/dismissed/pending) or save a refined suggestion.
// Also keeps the contract's issues_fixed / issues_dismissed counters in sync.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, clauseId } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as {
    status?: "replaced" | "dismissed" | "pending";
    refined_suggestion?: string;
    dismissed_reason?: string;
  };

  // Current status — so we only move a counter when the status actually changes.
  const current = await queryOne<{ status: string }>(
    `select status from risk_clauses where id = $1 and contract_id = $2`,
    [clauseId, id],
  );
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  const addRaw = (expr: string) => sets.push(expr);

  if (body.refined_suggestion !== undefined) add("refined_suggestion", body.refined_suggestion);

  const statusChanged = body.status !== undefined && body.status !== current.status;

  if (body.status !== undefined) {
    add("status", body.status);
    if (body.status === "replaced") {
      add("replaced_at", new Date().toISOString());
    } else if (body.status === "dismissed") {
      addRaw("dismissed_at = now()");
      if (body.dismissed_reason !== undefined) add("dismissed_reason", body.dismissed_reason);
    } else if (body.status === "pending") {
      addRaw("dismissed_at = null");
      addRaw("dismissed_reason = null");
    }
  } else if (body.dismissed_reason !== undefined) {
    add("dismissed_reason", body.dismissed_reason);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  values.push(clauseId, id);

  try {
    await query(
      `update risk_clauses set ${sets.join(", ")}
        where id = $${values.length - 1} and contract_id = $${values.length}`,
      values,
    );

    if (statusChanged) {
      if (body.status === "replaced") {
        await query(
          `update contracts set issues_fixed = issues_fixed + 1 where id = $1`,
          [id],
        );
      } else if (body.status === "dismissed") {
        await query(
          `update contracts set issues_dismissed = issues_dismissed + 1 where id = $1`,
          [id],
        );
      } else if (body.status === "pending") {
        // Un-dismiss / restore: reverse whichever counter the old status had bumped.
        if (current.status === "dismissed") {
          await query(
            `update contracts set issues_dismissed = greatest(issues_dismissed - 1, 0) where id = $1`,
            [id],
          );
        } else if (current.status === "replaced") {
          await query(
            `update contracts set issues_fixed = greatest(issues_fixed - 1, 0) where id = $1`,
            [id],
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
