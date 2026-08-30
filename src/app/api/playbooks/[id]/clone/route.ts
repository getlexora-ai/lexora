import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { clonePlaybook } from "@/lib/playbooks";

type Params = { params: Promise<{ id: string }> };

// POST /api/playbooks/[id]/clone — deep-copy a visible playbook (own or curated)
// into a fresh user-owned one. This is how a user customises the curated
// playbook; curated playbooks are read-only otherwise.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  try {
    const cloned = await clonePlaybook(id, userId);
    if (!cloned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(cloned, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
