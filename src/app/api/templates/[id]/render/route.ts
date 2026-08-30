import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { getTemplate } from "@/lib/contract-templates";
import { renderTemplate } from "@/lib/templates/render";

type Params = { params: Promise<{ id: string }> };

// POST /api/templates/[id]/render — pure placeholder substitution. No LLM, no
// external call: just `renderTemplate(body, values)` over a visible template.
// Returns { text, missing } where `missing` lists required variables with no value.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  let body: { values?: Record<string, string | number>; language?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const template = await getTemplate(id, userId);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const useEn = body.language === "en" && !!template.body_en;
    const source = useEn ? (template.body_en as string) : template.body;

    const { text, missing } = renderTemplate(source, body.values ?? {}, {
      variables: template.variables ?? [],
      sections: (template.sections ?? []).map((s) => ({ key: s.key, enabled: true })),
    });

    return NextResponse.json({ text, missing });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
