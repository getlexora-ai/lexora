import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { currentUserId } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError, errorResponse } from "@/lib/errors";
import { generateGermanRentalContract } from "@/lib/rag";
import { QuotaExhaustedError } from "@/lib/rag/gemini";
import { getTemplate } from "@/lib/contract-templates";
import { renderTemplate } from "@/lib/templates/render";

// The product is Germany-only: every contract is governed by German law. The
// sole user-facing choice is the output language.
type Language = "en" | "de";

type GenerateBody = {
  contractType: string;
  party1: string;
  party2: string;
  /** Output language for the draft. Jurisdiction is always Germany. */
  language?: Language;
  keyTerms?: string;
  // German residential-lease fields (only sent for contractType "Lease
  // Agreement"); see src/lib/rag.
  propertyAddress?: string;
  baseRentEur?: number;
  operatingCostsEur?: number;
  depositEur?: number;
  // Optional: generate from a saved template. `values` fills its {{placeholders}}.
  templateId?: string;
  values?: Record<string, string | number>;
};

function normaliseLanguage(v: unknown): Language {
  return v === "en" ? "en" : "de";
}

/** Route residential leases through the grounded German-law RAG pipeline. */
function isGermanResidentialLease(b: GenerateBody): boolean {
  return b.contractType === "Lease Agreement";
}

// Below this top-retrieval score the context is too weak to ground a draft on —
// fall back to the ungrounded path rather than cite thin air. In practice a
// genuine lease request retrieves at ~0.75+, so this only trips on a broken or
// unindexed store.
const MIN_GROUNDING_SCORE = 0.35;

/** Render a saved template's body against `values`, visibility-checked. Returns null when absent/invisible. */
async function renderTemplateBody(b: GenerateBody, language: Language): Promise<string | null> {
  if (!b.templateId) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const tpl = await getTemplate(b.templateId, userId);
  if (!tpl) return null;
  const source = language === "en" && tpl.body_en ? tpl.body_en : tpl.body;
  const { text } = renderTemplate(source, b.values ?? {}, {
    variables: tpl.variables ?? [],
    sections: (tpl.sections ?? []).map((s) => ({ key: s.key, enabled: true })),
  });
  return text.trim() || null;
}

async function draftGermanLease(b: GenerateBody, templateBody: string | null) {
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
      templateBody: templateBody ?? undefined,
      language: normaliseLanguage(b.language),
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
    const { contractType, party1, party2, keyTerms } = body;
    const language = normaliseLanguage(body.language);

    const templateBody = await renderTemplateBody(body, language);

    if (isGermanResidentialLease(body)) {
      try {
        return NextResponse.json({
          ...(await draftGermanLease(body, templateBody)),
          templateId: body.templateId ?? null,
        });
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

    const langName = language === "en" ? "English" : "German (Deutsch)";
    const structureBlock = templateBody
      ? `You MUST follow this required contract structure and clause wording, adapting only where the client's requirements below demand it:
--- REQUIRED STRUCTURE ---
${templateBody}
--- END REQUIRED STRUCTURE ---
`
      : "";
    const prompt = `This contract is governed by German law (BGB, and HGB where the parties are merchants). It must be written in ${langName}.

You are a senior German commercial contracts attorney (Rechtsanwalt). Draft a complete, professional ${contractType} between ${party1} and ${party2} under German law.

${structureBlock}${keyTerms ? `Key requirements from the client:\n${keyTerms}\n` : ""}

Requirements:
- Write the full contract with all standard sections for this contract type
- Use formal legal language appropriate for German law; cite the relevant BGB/HGB provisions where a clause depends on them (e.g. "(§ 309 BGB)")
- Respect mandatory German law: AGB-Kontrolle (§§ 305–310 BGB), and any statutory limits that apply to this contract type
- Include all standard clauses (definitions, obligations, term, termination, liability, governing law, etc.); governing law is German law with the place of jurisdiction in Germany
- Make it ready to use — no placeholders like [INSERT], use reasonable standard terms
- Format with numbered sections and clear headings
${language === "en"
  ? '- Write the contract in English, but keep German statutory citations verbatim (e.g. "§ 309 BGB") and give the German legal term in parentheses on first use'
  : "- Write the contract in German"}
- Return ONLY the contract text, no preamble or explanation

Write the complete contract now:`;

    const text = await askLLM({ prompt, maxTokens: 8192 });

    return NextResponse.json({ text, templateId: body.templateId ?? null });
  } catch (err) {
    return errorResponse(err, "generate");
  }
}
