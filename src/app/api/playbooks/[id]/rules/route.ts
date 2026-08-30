import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsPlaybook, signInRequired } from "@/lib/auth";
import { getPlaybook } from "@/lib/playbooks";
import { addRule } from "@/lib/playbooks";
import { isKnownTopic } from "@/lib/clause-taxonomy";

type Params = { params: Promise<{ id: string }> };

// POST /api/playbooks/[id]/rules — append one rule (owner only).
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (!(await ownsPlaybook(id, userId))) {
    const visible = await getPlaybook(id, userId);
    if (visible?.readonly) {
      return NextResponse.json({ error: "curated playbooks are read-only — clone to edit" }, { status: 403 });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const clause_type = str(body.clause_type);
  if (!clause_type || !isKnownTopic(clause_type)) {
    return NextResponse.json({ error: `unknown clause_type "${clause_type}"` }, { status: 400 });
  }
  if (!str(body.acceptable) || !str(body.unacceptable)) {
    return NextResponse.json({ error: "acceptable and unacceptable are required" }, { status: 400 });
  }

  try {
    const rule = await addRule(id, {
      clause_type,
      topic: str(body.topic) || undefined,
      acceptable: str(body.acceptable),
      fallback: str(body.fallback) || null,
      unacceptable: str(body.unacceptable),
      rationale: str(body.rationale) || null,
      reference: str(body.reference) || null,
      preferred_clause_id: str(body.preferred_clause_id) || null,
      severity: ["high", "medium", "low"].includes(String(body.severity))
        ? (body.severity as "high" | "medium" | "low")
        : undefined,
      is_required: !!body.is_required,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : undefined,
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
