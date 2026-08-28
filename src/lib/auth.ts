import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { queryOne } from "@/lib/db";

/** Clerk user id for the current request, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/** 401 body returned to the client when a save/write needs a signed-in user. */
export const signInRequired = () =>
  NextResponse.json({ error: "sign_in_required" }, { status: 401 });

/** True when the contract exists and belongs to this user. */
export async function ownsContract(contractId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from contracts where id = $1 and user_id = $2 and deleted_at is null`,
    [contractId, userId],
  );
  return row !== null;
}

/** True when the clause's parent contract belongs to this user. */
export async function ownsClause(clauseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select rc.id
       from risk_clauses rc
       join contracts c on c.id = rc.contract_id
      where rc.id = $1 and c.user_id = $2 and c.deleted_at is null`,
    [clauseId, userId],
  );
  return row !== null;
}
