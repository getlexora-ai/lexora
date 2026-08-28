import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id]/versions — list version snapshots (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const versions = await query(
      `select id, snapshot_reason, created_at
         from contract_versions
        where contract_id = $1
        order by created_at desc`,
      [id],
    );
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/contracts/[id]/versions — save a snapshot of the current delta
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { quill_delta, snapshot_reason } = await req.json() as {
    quill_delta: object;
    snapshot_reason?: string;
  };

  try {
    const row = await queryOne<{ id: string }>(
      `insert into contract_versions (contract_id, quill_delta, snapshot_reason, created_by)
       values ($1, $2, $3, $4)
       returning id`,
      [id, JSON.stringify(quill_delta), snapshot_reason ?? null, userId],
    );
    return NextResponse.json({ id: row?.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
