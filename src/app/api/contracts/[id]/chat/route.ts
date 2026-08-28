import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/contracts/[id]/chat — load chat history (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const messages = await query(
      `select id, role, content, created_at
         from chat_messages
        where contract_id = $1
        order by created_at`,
      [id],
    );
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/contracts/[id]/chat — save a message (user or assistant)
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { role, content } = await req.json() as {
    role: "user" | "assistant";
    content: string;
  };

  try {
    const message = await queryOne(
      `insert into chat_messages (contract_id, role, content)
       values ($1, $2, $3)
       returning id, role, content, created_at`,
      [id, role, content],
    );
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
