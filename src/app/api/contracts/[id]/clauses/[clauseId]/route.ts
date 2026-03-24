import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; clauseId: string }> };

// PATCH /api/contracts/[id]/clauses/[clauseId]
// Update clause status (replaced/dismissed) or save a refined suggestion
export async function PATCH(req: NextRequest, { params }: Params) {
  const { clauseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json() as {
    status?: "replaced" | "dismissed";
    refined_suggestion?: string;
  };

  const updates: Record<string, unknown> = {};
  if (body.status             !== undefined) updates.status             = body.status;
  if (body.refined_suggestion !== undefined) updates.refined_suggestion = body.refined_suggestion;
  if (body.status === "replaced")            updates.replaced_at        = new Date().toISOString();

  const { error } = await supabase
    .from("risk_clauses")
    .update(updates)
    .eq("id", clauseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
