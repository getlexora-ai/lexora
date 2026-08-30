import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { askLLM } from "@/lib/llm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError, errorResponse } from "@/lib/errors";
import { deltaToText, type Delta } from "@/lib/delta-text";

// POST /api/templates/suggest-variables — LLM-assisted de-identification. Given a
// contract, propose which literal spans should become {{variables}}. This is a
// paid compute route: rate-limited, and gated in src/proxy.ts.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    variables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["text", "textarea", "number", "date", "currency"] },
          literal: { type: "string" },
        },
        required: ["key", "label", "type", "literal"],
      },
    },
  },
  required: ["variables"],
};

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "template-vars");
    if (limited) return limited;

    const userId = await currentUserId();
    if (!userId) return signInRequired();

    let body: { contractId?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new AppError(400, "bad_json", "invalid JSON body");
    }
    const contractId = typeof body.contractId === "string" ? body.contractId : "";
    if (!contractId) throw new AppError(400, "missing_contract", "contractId is required");
    if (!(await ownsContract(contractId, userId))) {
      throw new AppError(404, "not_found", "Contract not found");
    }

    const contract = await queryOne<{ quill_delta: Delta | null; extracted_text: string | null }>(
      `select quill_delta, extracted_text
         from contracts where id = $1 and user_id = $2 and deleted_at is null`,
      [contractId, userId],
    );
    if (!contract) throw new AppError(404, "not_found", "Contract not found");

    const text = (contract.quill_delta ? deltaToText(contract.quill_delta) : contract.extracted_text ?? "").trim();
    if (!text) throw new AppError(400, "empty_contract", "the contract has no text");

    const prompt = `Du hilfst, aus einem konkreten Vertrag eine wiederverwendbare Vorlage zu machen.
Finde die Stellen, die von Vertrag zu Vertrag WECHSELN und deshalb Platzhalter werden sollten:
Namen der Parteien, Anschriften, Beträge (EUR), Daten, Fristen, Konto-/IBAN-Angaben, Flächen, Stückzahlen.

Regeln:
- "literal" MUSS ein wörtlich im Text vorkommender, eindeutiger Teilstring sein (so kurz wie möglich, aber eindeutig).
- "key" ist ein kurzer camelCase-Bezeichner (z. B. landlordName, baseRentEur, startDate).
- "type": text | textarea | number | date | currency.
- Keine allgemeinen Klauseltexte, nur die variablen Werte. Höchstens 20 Einträge.

VERTRAGSTEXT:
"""
${text.slice(0, 12000)}
"""`;

    const raw = await askLLM({
      prompt,
      maxTokens: 2048,
      responseSchema: RESPONSE_SCHEMA,
    });

    let parsed: { variables?: Array<{ key?: string; label?: string; type?: string; literal?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError(502, "llm_parse", "The AI service returned an unexpected result.");
    }

    const TYPES = new Set(["text", "textarea", "number", "date", "currency"]);
    const variables = (parsed.variables ?? [])
      .filter((v) => v && typeof v.key === "string" && typeof v.literal === "string" && v.literal.length > 0)
      .filter((v) => text.includes(v.literal as string)) // only keep literals that actually match
      .map((v) => ({
        key: (v.key as string).trim().replace(/[^\w]/g, "_"),
        label: typeof v.label === "string" && v.label.trim() ? v.label.trim() : (v.key as string),
        type: typeof v.type === "string" && TYPES.has(v.type) ? v.type : "text",
        literal: v.literal as string,
      }))
      .filter((v) => v.key.length > 0)
      .slice(0, 20);

    return NextResponse.json({ variables });
  } catch (err) {
    return errorResponse(err, "template-vars");
  }
}
