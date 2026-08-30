import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsPlaybook, signInRequired } from "@/lib/auth";
import {
  getPlaybook,
  getPlaybookWithRules,
  softDeletePlaybook,
  updatePlaybook,
} from "@/lib/playbooks";

type Params = { params: Promise<{ id: string }> };

const CURATED_READONLY = { error: "curated playbooks are read-only — clone to edit" };

// GET /api/playbooks/[id] — playbook + rules (owner or curated).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  try {
    const result = await getPlaybookWithRules(id, userId);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/playbooks/[id] — edit an owned playbook (never a curated one).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsPlaybook(id, userId))) {
    const visible = await getPlaybook(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const playbook = await updatePlaybook(id, userId, body);
    if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ playbook });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/playbooks/[id] — soft-delete an owned playbook.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsPlaybook(id, userId))) {
    const visible = await getPlaybook(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await softDeletePlaybook(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
