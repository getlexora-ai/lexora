import { NextRequest, NextResponse } from "next/server";
import { analyseContract, analyseContractWithPlaybook } from "@/lib/analysis";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { RiskClause } from "@/lib/analysis-store";
import { currentUserId } from "@/lib/auth";
import { resolvePlaybookForAnalysis, toPromptRule } from "@/lib/playbooks";

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "analyse");
    if (limited) return limited;

    const { text, language, playbookId, contractType } = (await req.json()) as {
      text: string;
      language?: "en" | "de";
      playbookId?: string | null;
      contractType?: string;
    };
    if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

    const lang = language === "en" ? "en" : "de";

    // Playbook is opt-in: an explicit playbookId, or the signed-in user's
    // workspace default for this contract type. Signed-out callers can't
    // resolve a default, so they always get the plain analysis.
    const userId = await currentUserId();
    const wantsPlaybook = playbookId != null || userId != null;
    const pb =
      wantsPlaybook && userId
        ? await resolvePlaybookForAnalysis(userId, contractType ?? "", playbookId ?? null)
        : null;

    if (pb && pb.rules.length > 0) {
      const { issues, coverage, guardrails } = await analyseContractWithPlaybook(text, {
        language: lang,
        rules: pb.rules.map(toPromptRule),
        contractType: contractType ?? undefined,
      });
      const clauses: RiskClause[] = issues.map((c, i) => ({ ...c, id: `clause-${i}-${Date.now()}` }));
      return NextResponse.json({
        clauses,
        coverage,
        guardrails,
        playbook: { id: pb.playbook.id, name: pb.playbook.name, is_approved: pb.playbook.is_approved },
      });
    }

    // No playbook — the guardrail check still runs for a known contract type.
    const { issues, guardrails } = await analyseContract(text, {
      language: lang,
      contractType: contractType ?? undefined,
    });
    const clauses: RiskClause[] = issues.map((c, i) => ({ ...c, id: `clause-${i}-${Date.now()}` }));
    return NextResponse.json({ clauses, guardrails });
  } catch (err) {
    return errorResponse(err, "analyse");
  }
}
