import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/contracts — list all contracts for the logged-in user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("contracts")
    .select("id, name, contract_type, risk_level, total_issues, issues_fixed, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contracts: data });
}

// POST /api/contracts — create contract + bulk insert clauses after analysis
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json() as {
    name: string;
    contract_type: string;
    extracted_text: string;
    risk_level: "high" | "medium" | "low";
    clauses: Array<{
      type: "high" | "medium" | "low";
      clause: string;
      passage: string;
      issue: string;
      suggestion: string;
      sort_order: number;
    }>;
  };

  // Insert contract row
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      user_id: user.id,
      name: body.name,
      contract_type: body.contract_type,
      extracted_text: body.extracted_text,
      risk_level: body.risk_level,
      total_issues: body.clauses.length,
      issues_fixed: 0,
    })
    .select("id")
    .single();

  if (contractError) return NextResponse.json({ error: contractError.message }, { status: 500 });

  // Bulk insert clauses
  if (body.clauses.length > 0) {
    const rows = body.clauses.map(c => ({
      contract_id: contract.id,
      type: c.type,
      clause: c.clause,
      passage: c.passage,
      issue: c.issue,
      suggestion: c.suggestion,
      sort_order: c.sort_order,
      status: "pending" as const,
    }));

    const { error: clausesError } = await supabase.from("risk_clauses").insert(rows);
    if (clausesError) return NextResponse.json({ error: clausesError.message }, { status: 500 });
  }

  return NextResponse.json({ id: contract.id }, { status: 201 });
}
