import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id] — fetch contract + its clauses
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: contract, error } = await supabase
    .from("contracts")
    .select(`
      id, name, contract_type, extracted_text, quill_delta,
      risk_level, total_issues, issues_fixed, created_at,
      risk_clauses (
        id, type, clause, passage, issue, suggestion,
        refined_suggestion, status, sort_order, replaced_at
      )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ contract });
}

// PATCH /api/contracts/[id] — update name, quill_delta, issues_fixed
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    quill_delta?: object;
    issues_fixed?: number;
  };

  const updates: Record<string, unknown> = {};
  if (body.name         !== undefined) updates.name         = body.name;
  if (body.quill_delta  !== undefined) updates.quill_delta  = body.quill_delta;
  if (body.issues_fixed !== undefined) updates.issues_fixed = body.issues_fixed;

  const { error } = await supabase
    .from("contracts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/contracts/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
