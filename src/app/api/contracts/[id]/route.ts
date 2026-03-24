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

// DELETE /api/contracts/[id] — hard delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Also delete the stored file from Storage if one exists
  const { data: contract } = await supabase
    .from("contracts")
    .select("file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (contract?.file_path) {
    await supabase.storage.from("contract_files").remove([contract.file_path]);
  }

  const { error } = await supabase
    .from("contracts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
