import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ clauseId: string }> };

// GET /api/clauses/[clauseId]/refinements — list all refinement attempts
export async function GET(_req: NextRequest, { params }: Params) {
  const { clauseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("clause_refinements")
    .select("id, user_note, refined_output, was_applied, created_at")
    .eq("clause_id", clauseId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ refinements: data });
}

// POST /api/clauses/[clauseId]/refinements — log a refinement attempt
export async function POST(req: NextRequest, { params }: Params) {
  const { clauseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { user_note, refined_output, was_applied } = await req.json() as {
    user_note: string;
    refined_output: string;
    was_applied?: boolean;
  };

  const { data, error } = await supabase
    .from("clause_refinements")
    .insert({ clause_id: clauseId, user_note, refined_output, was_applied: was_applied ?? false })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
