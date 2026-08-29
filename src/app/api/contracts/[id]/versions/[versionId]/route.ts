import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string; versionId: string }> };

// GET /api/contracts/[id]/versions/[versionId] — one snapshot's full delta (owner only).
// The list endpoint omits quill_delta to stay light; this returns it for a restore.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, versionId } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const row = await queryOne<{
      id: string;
      quill_delta: unknown;
      snapshot_reason: string | null;
      created_at: string;
    }>(
      `select id, quill_delta, snapshot_reason, created_at
         from contract_versions
        where id = $1 and contract_id = $2`,
      [versionId, id],
    );
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ version: row });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
