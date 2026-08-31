import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { currentUserId } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError, errorResponse } from "@/lib/errors";
import { generateGermanRentalContract } from "@/lib/rag";
import { QuotaExhaustedError } from "@/lib/rag/gemini";
import { getTemplate } from "@/lib/contract-templates";
import { renderTemplate } from "@/lib/templates/render";
import { listClauses } from "@/lib/clause-library";
import {
  evaluateGuardrails,
  formatGuardrailsForPrompt,
  type GuardrailFields,
  type GuardrailReport,
} from "@/lib/guardrails";

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

const num = (v: unknown): number | undefined =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : undefined;

/** The structured facts the numeric guardrails (deposit cap …) validate against. */
function guardrailFieldsOf(b: GenerateBody): GuardrailFields {
  return {
    baseRentEur: num(b.baseRentEur),
    operatingCostsEur: num(b.operatingCostsEur),
    depositEur: num(b.depositEur),
  };
}

type RenderedTemplate = { text: string; missing: string[]; langOk: boolean };

/**
 * Render a saved template's body against `values`, visibility-checked.
 * `langOk` is false when an English draft was asked for but the template has no
 * `body_en` (so the deterministic fast path must not fire). Returns null when
 * the template is absent / not visible.
 */
async function renderTemplateBody(
  b: GenerateBody,
  language: Language,
): Promise<RenderedTemplate | null> {
  if (!b.templateId) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const tpl = await getTemplate(b.templateId, userId);
  if (!tpl) return null;
  const langOk = language === "de" || !!tpl.body_en;
  const source = language === "en" && tpl.body_en ? tpl.body_en : tpl.body;
  const { text, missing } = renderTemplate(source, b.values ?? {}, {
    variables: tpl.variables ?? [],
    sections: (tpl.sections ?? []).map((s) => ({ key: s.key, enabled: true })),
  });
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { text: trimmed, missing, langOk };
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

/** Best-effort: the curated library wording for the failing guardrail topics. */
async function curatedClausesFor(topics: string[], language: Language): Promise<string> {
  const out: string[] = [];
  for (const type of [...new Set(topics)]) {
    try {
      const { clauses } = await listClauses({
        userId: "",
        type,
        scope: "curated",
        limit: 1,
      });
      const c = clauses[0];
      if (!c) continue;
      const bodyText = language === "en" && c.content_en ? c.content_en : c.content;
      out.push(`[${c.title}]\n${bodyText}`);
    } catch {
      /* library not seeded / DB down — the guardrail block alone still drives the fix */
    }
  }
  return out.join("\n\n");
}

/** One bounded pass: fix only the listed guardrail failures, keep the rest verbatim. */
async function repairGuardrails(
  draft: string,
  report: GuardrailReport,
  language: Language,
): Promise<string> {
  const block = formatGuardrailsForPrompt(report);
  const refs = await curatedClausesFor(
    report.hardFailures.map((f) => f.topic),
    language,
  );
  const system =
    language === "en"
      ? "You are a German Rechtsanwalt. Fix ONLY the listed guardrail violations in the contract below. Change nothing else — every other clause, heading and wording stays byte-for-byte identical. Return ONLY the full corrected contract, no preamble."
      : "Du bist Fachanwalt für Mietrecht. Behebe AUSSCHLIESSLICH die unten aufgeführten Guardrail-Verstöße im folgenden Vertrag. Ändere sonst nichts — jede andere Klausel, Überschrift und Formulierung bleibt unverändert. Gib NUR den vollständigen korrigierten Vertrag zurück, ohne Vorbemerkung.";
  const prompt = `${block}

${refs ? `GEPRÜFTE KLAUSELVORLAGEN (Wortlaut übernehmen, an die Vertragsdaten anpassen):\n${refs}\n\n` : ""}VERTRAG:
${draft}`;
  return askLLM({ system, prompt, maxTokens: 8192 });
}

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "generate");
    if (limited) return limited;

    const body = (await req.json()) as GenerateBody;
    const { contractType, party1, party2, keyTerms } = body;
    const language = normaliseLanguage(body.language);
    const fields = guardrailFieldsOf(body);

    const rendered = await renderTemplateBody(body, language);
    const templateBody = rendered?.text ?? null;

    // ── Deterministic fast path ──────────────────────────────────────────
    // A fully-filled template in the requested language, with no free-text
    // asks, needs no model: the template is lawyer-authored, so we substitute
    // and return. The guardrail check still runs — a failure here is a
    // template bug worth surfacing.
    if (rendered && rendered.langOk && rendered.missing.length === 0 && !keyTerms?.trim()) {
      const guardrails = evaluateGuardrails({
        contractText: rendered.text,
        contractType,
        fields,
        language,
      });
      return NextResponse.json({
        text: rendered.text,
        guardrails,
        rendered: true,
        templateId: body.templateId ?? null,
      });
    }

    // ── Draft ───────────────────────────────────────────────────────────
    let draftText: string;
    let leaseMeta: { grounded: boolean; groundingRefs: string[]; retrievedDocs: string[] } | null =
      null;

    if (isGermanResidentialLease(body)) {
      try {
        const out = await draftGermanLease(body, templateBody);
        draftText = out.text;
        leaseMeta = {
          grounded: out.grounded,
          groundingRefs: out.groundingRefs,
          retrievedDocs: out.retrievedDocs,
        };
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
    } else {
      const langName = language === "en" ? "English" : "German (Deutsch)";
      const clientBlock = keyTerms
        ? `CLIENT REQUIREMENTS (these take precedence over the starting structure, unless mandatory German law forbids it — then correct it and name the norm):
${keyTerms}

`
        : "";
      const structureBlock = templateBody
        ? `STARTING STRUCTURE (use as the basis; where the client requirements above differ or ask for more, follow the client):
--- STARTING STRUCTURE ---
${templateBody}
--- END STARTING STRUCTURE ---
`
        : "";
      const prompt = `This contract is governed by German law (BGB, and HGB where the parties are merchants). It must be written in ${langName}.

You are a senior German commercial contracts attorney (Rechtsanwalt). Draft a complete, professional ${contractType} between ${party1} and ${party2} under German law.

${clientBlock}${structureBlock}

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

      draftText = await askLLM({ prompt, maxTokens: 8192 });
    }

    // ── Guardrail gate + one bounded repair pass ─────────────────────────
    let guardrails = evaluateGuardrails({
      contractText: draftText,
      contractType,
      fields,
      language,
    });
    if (!guardrails.ok) {
      try {
        const repaired = (await repairGuardrails(draftText, guardrails, language)).trim();
        if (repaired) {
          draftText = repaired;
          guardrails = evaluateGuardrails({
            contractText: draftText,
            contractType,
            fields,
            language,
          });
        }
      } catch (err) {
        console.error("[generate] guardrail repair failed:", err);
      }
    }

    return NextResponse.json({
      text: draftText,
      guardrails,
      ...(leaseMeta ?? {}),
      templateId: body.templateId ?? null,
    });
  } catch (err) {
    return errorResponse(err, "generate");
  }
}
