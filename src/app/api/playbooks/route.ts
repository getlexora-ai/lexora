import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { createPlaybook, listPlaybooks } from "@/lib/playbooks";

// GET /api/playbooks?contract_type= — list visible playbooks (own + curated).
// Signed-out users get an empty list, same as /api/contracts.
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ playbooks: [] });

  try {
    const playbooks = await listPlaybooks(
      userId,
      req.nextUrl.searchParams.get("contract_type") ?? undefined,
    );
    return NextResponse.json({ playbooks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/playbooks — create a user-owned playbook (+ optional rules).
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const created = await createPlaybook(userId, {
      name,
      contract_type: typeof body.contract_type === "string" ? body.contract_type : "",
      description: typeof body.description === "string" ? body.description : null,
      language: body.language === "en" ? "en" : "de",
      rules: Array.isArray(body.rules) ? (body.rules as never[]) : [],
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
