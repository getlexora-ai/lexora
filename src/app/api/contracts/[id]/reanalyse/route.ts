import { NextRequest, NextResponse } from "next/server";
import { analyseContract, analyseContractWithPlaybook, type Issue } from "@/lib/analysis";
import { query } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RiskClause } from "@/lib/analysis-store";
import { resolvePlaybookForAnalysis, toPromptRule } from "@/lib/playbooks";

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

  const { text, language, playbookId, contractType } = (await req.json()) as {
    text: string;
    language?: "en" | "de";
    playbookId?: string | null;
    contractType?: string;
  };
  if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });
  const lang = language === "en" ? "en" : "de";

  // Playbook: explicit playbookId, else the user's workspace default.
  const pb = await resolvePlaybookForAnalysis(userId, contractType ?? "", playbookId ?? null);
  const usePlaybook = !!pb && pb.rules.length > 0;

  let issues: Issue[];
  let coverage: Awaited<ReturnType<typeof analyseContractWithPlaybook>>["coverage"] = [];
  try {
    if (usePlaybook) {
      const out = await analyseContractWithPlaybook(text, {
        language: lang,
        rules: pb!.rules.map(toPromptRule),
      });
      issues = out.issues;
      coverage = out.coverage;
    } else {
      issues = await analyseContract(text, lang);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let inserted: Array<{
    id: string; type: string; clause: string; passage: string;
    issue: string; suggestion: string; sort_order: number;
    reference: string | null; playbook_rule_id: string | null; verdict: string | null;
  }> = [];

  try {
    // Replace the existing pending clauses for this contract
    await query(`delete from risk_clauses where contract_id = $1 and status = 'pending'`, [id]);

    if (issues.length > 0) {
      const rows: string[] = [];
      const values: unknown[] = [];
      issues.forEach((c, i) => {
        const b = i * 11;
        rows.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11})`,
        );
        values.push(
          id, c.type, c.clause, c.passage, c.issue, c.suggestion, i, "pending",
          c.reference ?? null,
          c.rule_id ?? null,
          c.verdict ?? null,
        );
      });

      inserted = await query(
        `insert into risk_clauses
           (contract_id, type, clause, passage, issue, suggestion, sort_order, status,
            reference, playbook_rule_id, verdict)
         values ${rows.join(", ")}
         returning id, type, clause, passage, issue, suggestion, sort_order,
                   reference, playbook_rule_id, verdict`,
        values,
      );
    }

    await query(
      `update contracts set total_issues = $1, issues_fixed = 0, playbook_id = $2 where id = $3`,
      [issues.length, usePlaybook ? pb!.playbook.id : null, id],
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const clauses: RiskClause[] = inserted
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      id: c.id,
      type: c.type as RiskClause["type"],
      clause: c.clause,
      passage: c.passage,
      issue: c.issue,
      suggestion: c.suggestion,
      ...(c.reference ? { reference: c.reference } : {}),
      ...(c.playbook_rule_id ? { playbook_rule_id: c.playbook_rule_id } : {}),
      ...(c.verdict ? { verdict: c.verdict as "meets" | "fallback" | "redline" } : {}),
    }));

  if (usePlaybook) {
    return NextResponse.json({
      clauses,
      coverage,
      playbook: { id: pb!.playbook.id, name: pb!.playbook.name, is_approved: pb!.playbook.is_approved },
    });
  }
  return NextResponse.json({ clauses });
}
