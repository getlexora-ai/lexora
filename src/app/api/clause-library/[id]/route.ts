import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsLibraryClause, signInRequired } from "@/lib/auth";
import { getClause, softDeleteClause, updateClause } from "@/lib/clause-library";
import { isKnownTopic } from "@/lib/clause-taxonomy";

type Params = { params: Promise<{ id: string }> };

const POSTURES = new Set(["preferred", "fallback", "walk_away"]);
const CURATED_READONLY = { error: "curated clauses are read-only" };

// GET /api/clause-library/[id] — one clause the user can see (own or curated).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  try {
    const clause = await getClause(id, userId);
    if (!clause) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ clause });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/clause-library/[id] — edit an owned clause (never a curated one).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsLibraryClause(id, userId))) {
    // Distinguish "exists but curated" from "not found" for a clearer 4xx.
    const visible = await getClause(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.clause_type === "string" && !isKnownTopic(body.clause_type)) {
    return NextResponse.json({ error: `unknown clause_type "${body.clause_type}"` }, { status: 400 });
  }
  if (typeof body.posture === "string" && !POSTURES.has(body.posture)) {
    return NextResponse.json({ error: `invalid posture "${body.posture}"` }, { status: 400 });
  }

  try {
    const clause = await updateClause(id, userId, body);
    if (!clause) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ clause });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/clause-library/[id] — soft-delete an owned clause.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsLibraryClause(id, userId))) {
    const visible = await getClause(id, userId);
    if (visible?.readonly) return NextResponse.json(CURATED_READONLY, { status: 403 });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await softDeleteClause(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
