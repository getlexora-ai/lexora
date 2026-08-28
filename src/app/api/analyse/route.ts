import { NextRequest, NextResponse } from "next/server";
import { analyseContract } from "@/lib/analysis";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RiskClause } from "@/lib/analysis-store";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "analyse");
    if (limited) return limited;

    const { text } = await req.json() as { text: string };
    if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

    const issues = await analyseContract(text);

    const clauses: RiskClause[] = issues.map((c, i) => ({
      ...c,
      id: `clause-${i}-${Date.now()}`,
    }));

    return NextResponse.json({ clauses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
