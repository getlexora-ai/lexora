import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { createClause, listClauses } from "@/lib/clause-library";
import { isKnownTopic } from "@/lib/clause-taxonomy";

const POSTURES = new Set(["preferred", "fallback", "walk_away"]);

// GET /api/clause-library — list visible clauses (own + system-curated).
// Signed-out users get an empty list, same as /api/contracts.
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ clauses: [], total: 0 });

  const sp = req.nextUrl.searchParams;
  const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const scope = sp.get("scope");

  try {
    const result = await listClauses({
      userId,
      type: sp.get("type") ?? undefined,
      posture: sp.get("posture") ?? undefined,
      scope: scope === "mine" || scope === "curated" ? scope : "all",
      q: sp.get("q") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      approvedOnly: sp.get("approved") === "1" || sp.get("approved") === "true",
      limit: num(sp.get("limit")),
      offset: num(sp.get("offset")),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/clause-library — create a user-owned clause.
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(body.title);
  const content = str(body.content);
  const clause_type = str(body.clause_type);

  if (!title || !content || !clause_type) {
    return NextResponse.json(
      { error: "title, content and clause_type are required" },
      { status: 400 },
    );
  }
  if (!isKnownTopic(clause_type)) {
    return NextResponse.json({ error: `unknown clause_type "${clause_type}"` }, { status: 400 });
  }
  const posture = str(body.posture) || "preferred";
  if (!POSTURES.has(posture)) {
    return NextResponse.json({ error: `invalid posture "${posture}"` }, { status: 400 });
  }

  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];

  try {
    const clause = await createClause(userId, {
      title,
      content,
      clause_type,
      posture: posture as "preferred" | "fallback" | "walk_away",
      title_en: str(body.title_en) || null,
      content_en: str(body.content_en) || null,
      summary: str(body.summary) || null,
      reference: str(body.reference) || null,
      tags: strArr(body.tags),
      contract_types: strArr(body.contract_types),
      source: body.source === "imported" ? "imported" : "user",
    });
    return NextResponse.json({ clause }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
