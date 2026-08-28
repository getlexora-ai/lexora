import { NextRequest, NextResponse } from "next/server";
import { analyseContract } from "@/lib/analysis";
import { query } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RiskClause } from "@/lib/analysis-store";

type Params = { params: Promise<{ id: string }> };

// POST /api/contracts/[id]/reanalyse — re-run AI analysis on current document text
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limited = await enforceRateLimit(req, "reanalyse");
  if (limited) return limited;

  const { text } = await req.json() as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  let issues;
  try {
    issues = await analyseContract(text);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let inserted: Array<{
    id: string; type: string; clause: string; passage: string;
    issue: string; suggestion: string; sort_order: number;
  }> = [];

  try {
    // Replace the existing pending clauses for this contract
    await query(
      `delete from risk_clauses where contract_id = $1 and status = 'pending'`,
      [id],
    );

    if (issues.length > 0) {
      const rows: string[] = [];
      const values: unknown[] = [];
      issues.forEach((c, i) => {
        const b = i * 8;
        rows.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`,
        );
        values.push(id, c.type, c.clause, c.passage, c.issue, c.suggestion, i, "pending");
      });

      inserted = await query(
        `insert into risk_clauses
           (contract_id, type, clause, passage, issue, suggestion, sort_order, status)
         values ${rows.join(", ")}
         returning id, type, clause, passage, issue, suggestion, sort_order`,
        values,
      );
    }

    await query(
      `update contracts set total_issues = $1, issues_fixed = 0 where id = $2`,
      [issues.length, id],
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const clauses: RiskClause[] = inserted
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      id: c.id,
      type: c.type as RiskClause["type"],
      clause: c.clause,
      passage: c.passage,
      issue: c.issue,
      suggestion: c.suggestion,
    }));

  return NextResponse.json({ clauses });
}
