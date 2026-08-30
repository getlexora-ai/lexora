import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsTemplate, signInRequired } from "@/lib/auth";
import { getTemplate, softDeleteTemplate, updateTemplate } from "@/lib/contract-templates";

type Params = { params: Promise<{ id: string }> };

const CURATED_READONLY = { error: "curated templates are read-only" };

// GET /api/templates/[id] — one template the user can see (own or curated).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  try {
    const template = await getTemplate(id, userId);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/templates/[id] — edit an owned template (never a curated one).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsTemplate(id, userId))) {
    const visible = await getTemplate(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.language === "string" && body.language !== "de" && body.language !== "en") {
    return NextResponse.json({ error: `invalid language "${body.language}"` }, { status: 400 });
  }

  try {
    const template = await updateTemplate(id, userId, body);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/templates/[id] — soft-delete an owned template.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsTemplate(id, userId))) {
    const visible = await getTemplate(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await softDeleteTemplate(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
