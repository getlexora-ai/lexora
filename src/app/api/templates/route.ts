import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { createTemplate, listTemplates } from "@/lib/contract-templates";

// GET /api/templates — list visible templates (own + system-curated).
// Signed-out users get an empty list, same as /api/contracts.
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ templates: [], total: 0 });

  const sp = req.nextUrl.searchParams;
  const num = (v: string | null) =>
    v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
  const src = sp.get("source");

  try {
    const result = await listTemplates({
      userId,
      contractType: sp.get("contract_type") ?? undefined,
      source: src === "curated" || src === "user" ? src : undefined,
      language: sp.get("language") ?? undefined,
      q: sp.get("q") ?? undefined,
      limit: num(sp.get("limit")),
      offset: num(sp.get("offset")),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/templates — create a user-owned template.
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
  const name = str(body.name);
  const contract_type = str(body.contract_type);
  const templateBody = typeof body.body === "string" ? body.body : "";

  if (!name || !contract_type || !templateBody.trim()) {
    return NextResponse.json(
      { error: "name, contract_type and body are required" },
      { status: 400 },
    );
  }

  const language = str(body.language) || "de";
  if (language !== "de" && language !== "en") {
    return NextResponse.json({ error: `invalid language "${language}"` }, { status: 400 });
  }

  const strArr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
      : [];
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  try {
    const template = await createTemplate(userId, {
      name,
      contract_type,
      body: templateBody,
      language,
      name_en: str(body.name_en) || null,
      description: str(body.description) || null,
      sections: arr(body.sections) as never,
      variables: arr(body.variables) as never,
      tags: strArr(body.tags),
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
