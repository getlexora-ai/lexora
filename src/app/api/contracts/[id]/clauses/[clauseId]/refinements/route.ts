import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ clauseId: string }> };

// POST /api/contracts/[id]/clauses/[clauseId]/refinements
// Saves a refinement attempt (user note + Claude output) to clause_refinements table
export async function POST(req: NextRequest, { params }: Params) {
  const { clauseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json() as {
    user_note: string;
    refined_output: string;
    was_applied?: boolean;
  };

  if (!body.user_note || !body.refined_output) {
    return NextResponse.json({ error: "user_note and refined_output are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("clause_refinements")
    .insert({
      clause_id:      clauseId,
      user_note:      body.user_note,
      refined_output: body.refined_output,
      was_applied:    body.was_applied ?? false,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
