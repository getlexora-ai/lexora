import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchClauses } from "@/lib/clause-library";
import { errorResponse } from "@/lib/errors";

// POST /api/clause-library/search — semantic search over the clause library.
// Compute route: embeds the query with Gemini (gated in src/proxy.ts). Falls
// back to lexical search inside searchClauses when embedding is unavailable.
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "clause-search");
    if (limited) return limited;

    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const body = (await req.json()) as { query?: string; type?: string; topK?: number };
    const q = typeof body.query === "string" ? body.query : "";
    if (!q.trim()) return NextResponse.json({ hits: [], mode: "lexical" });

    const result = await searchClauses(userId, q, {
      type: typeof body.type === "string" ? body.type : undefined,
      topK: typeof body.topK === "number" ? body.topK : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "clause-search");
  }
}
