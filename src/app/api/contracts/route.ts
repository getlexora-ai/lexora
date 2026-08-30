import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { currentUserId, signInRequired } from "@/lib/auth";

// GET /api/contracts — list the signed-in user's contracts (empty when signed out)
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ contracts: [] });

  try {
    const contracts = await query(
      `select id, name, contract_type, risk_level, total_issues, issues_fixed, issues_dismissed, created_at
         from contracts
        where user_id = $1 and deleted_at is null
        order by created_at desc`,
      [userId],
    );
    return NextResponse.json({ contracts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/contracts — create contract + bulk insert clauses after analysis
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  const body = await req.json() as {
    name: string;
    contract_type: string;
    extracted_text: string;
    file_path?: string | null;
    risk_level: "high" | "medium" | "low";
    playbook_id?: string | null;          // db/008 — set when analysed against a playbook
    clauses: Array<{
      type: "high" | "medium" | "low";
      clause: string;
      passage: string;
      issue: string;
      suggestion: string;
      sort_order: number;
      source?: "ai" | "user";
      // db/008 — carried through from a playbook-aware analysis (optional).
      reference?: string | null;
      playbook_rule_id?: string | null;
      verdict?: "meets" | "fallback" | "redline" | null;
    }>;
  };

  try {
    // Insert contract row
    const contract = await queryOne<{ id: string }>(
      `insert into contracts
         (user_id, name, contract_type, extracted_text, file_path, risk_level, total_issues, issues_fixed, playbook_id)
       values ($1, $2, $3, $4, $5, $6, $7, 0, $8)
       returning id`,
      [
        userId,
        body.name,
        body.contract_type,
        body.extracted_text,
        body.file_path ?? null,
        body.risk_level,
        body.clauses.length,
        body.playbook_id ?? null,
      ],
    );

    if (!contract) {
      return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
    }

    // Bulk insert clauses
    if (body.clauses.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      body.clauses.forEach((c, i) => {
        const b = i * 12;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12})`,
        );
        params.push(
          contract.id, c.type, c.clause, c.passage, c.issue, c.suggestion, c.sort_order, "pending",
          c.source ?? "ai",
          c.reference ?? null, c.playbook_rule_id ?? null, c.verdict ?? null,
        );
      });

      const inserted = await query<{ id: string; sort_order: number }>(
        `insert into risk_clauses
           (contract_id, type, clause, passage, issue, suggestion, sort_order, status, source,
            reference, playbook_rule_id, verdict)
         values ${values.join(", ")}
         returning id, sort_order`,
        params,
      );

      const clauses = inserted.sort((a, b) => a.sort_order - b.sort_order);
      return NextResponse.json({ id: contract.id, clauses }, { status: 201 });
    }

    return NextResponse.json({ id: contract.id, clauses: [] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
