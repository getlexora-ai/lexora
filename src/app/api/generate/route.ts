import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError, errorResponse } from "@/lib/errors";
import { generateGermanRentalContract } from "@/lib/rag";
import { QuotaExhaustedError } from "@/lib/rag/gemini";

type GenerateBody = {
  contractType: string;
  party1: string;
  party2: string;
  jurisdiction: string;
  keyTerms?: string;
  // German residential-lease fields (only sent for jurisdiction "Germany" +
  // contractType "Lease Agreement"); see src/lib/rag.
  propertyAddress?: string;
  baseRentEur?: number;
  operatingCostsEur?: number;
  depositEur?: number;
};

/** Route German residential leases through the grounded RAG pipeline. */
function isGermanResidentialLease(b: GenerateBody): boolean {
  return b.jurisdiction === "Germany" && b.contractType === "Lease Agreement";
}

// Below this top-retrieval score the context is too weak to ground a draft on —
// fall back to the ungrounded path rather than cite thin air. In practice a
// genuine lease request retrieves at ~0.75+, so this only trips on a broken or
// unindexed store.
const MIN_GROUNDING_SCORE = 0.35;

async function draftGermanLease(b: GenerateBody) {
  const baseRentEur = Number(b.baseRentEur);
  if (!b.propertyAddress?.trim() || !Number.isFinite(baseRentEur) || baseRentEur <= 0) {
    throw new AppError(
      400,
      "generate_missing_fields",
      "A German residential lease needs the property address and the net cold rent (Nettokaltmiete).",
    );
  }

  const num = (v: number | undefined) =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : undefined;

  const result = await generateGermanRentalContract(
    {
      landlord: b.party1,
      tenant: b.party2,
      propertyAddress: b.propertyAddress.trim(),
      baseRentEur,
      operatingCostsEur: num(b.operatingCostsEur),
      depositEur: num(b.depositEur),
      keyTerms: b.keyTerms?.trim() || undefined,
    },
    // Route generation through the app's LLM adapter so it shares the
    // AppError taxonomy, blockReason handling and retry policy.
    { complete: (args) => askLLM(args) },
  );

  const topScore = result.context[0]?.score ?? 0;
  return {
    text: result.contract,
    grounded: topScore >= MIN_GROUNDING_SCORE,
    groundingRefs: result.groundingRefs,
    retrievedDocs: [...new Set(result.context.map((h) => h.chunk.docId))],
  };
}

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "generate");
    if (limited) return limited;

    const body = (await req.json()) as GenerateBody;
    const { contractType, party1, party2, jurisdiction, keyTerms } = body;

    if (isGermanResidentialLease(body)) {
      try {
        return NextResponse.json(await draftGermanLease(body));
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          throw new AppError(
            503,
            "llm_busy",
            "The AI service is busy right now. Please try again in a moment.",
          );
        }
        throw err;
      }
    }

    const prompt = `You are a senior commercial contracts attorney. Draft a complete, professional ${contractType} between ${party1} and ${party2} governed by ${jurisdiction} law.

${keyTerms ? `Key requirements from the client:\n${keyTerms}\n` : ""}

Requirements:
- Write the full contract with all standard sections for this contract type
- Use formal legal language appropriate for ${jurisdiction} jurisdiction
- Include all standard clauses (definitions, obligations, term, termination, liability, governing law, etc.)
- Make it ready to use — no placeholders like [INSERT], use reasonable standard terms
- Format with numbered sections and clear headings
- Return ONLY the contract text, no preamble or explanation

Write the complete contract now:`;

    const text = await askLLM({ prompt, maxTokens: 8192 });

    return NextResponse.json({ text });
  } catch (err) {
    return errorResponse(err, "generate");
  }
}
