import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsPlaybook, signInRequired } from "@/lib/auth";
import { deleteRule, getPlaybook, updateRule } from "@/lib/playbooks";

type Params = { params: Promise<{ id: string; ruleId: string }> };

async function guard(id: string) {
  const userId = await currentUserId();
  if (!userId) return { res: signInRequired() as NextResponse };
  if (!(await ownsPlaybook(id, userId))) {
    const visible = await getPlaybook(id, userId);
    const res = visible?.readonly
      ? NextResponse.json({ error: "curated playbooks are read-only — clone to edit" }, { status: 403 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
    return { res };
  }
  return { userId };
}

// PATCH /api/playbooks/[id]/rules/[ruleId] — partial rule update (owner only).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, ruleId } = await params;
  const g = await guard(id);
  if (g.res) return g.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const rule = await updateRule(ruleId, id, body);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/playbooks/[id]/rules/[ruleId] — hard delete (owner only).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, ruleId } = await params;
  const g = await guard(id);
  if (g.res) return g.res;

  try {
    const ok = await deleteRule(ruleId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
