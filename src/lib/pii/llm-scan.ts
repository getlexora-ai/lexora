// Layer 3 — a model pass that returns verbatim PII spans the regexes miss
// (unmarked names, addresses without a keyword, unusual formats).
//
// This file is the ONLY one in src/lib/pii that touches the app (askLLM).
//
// ⚠ In production this call must itself run on a PII-safe path — a local model,
// or a DPA-covered / zero-retention endpoint — since the input still contains
// raw personal data. In the playground it exists purely to compare L3 coverage
// against L1 + L2 and decide whether L3 earns its place.

import { askLLM } from "@/lib/llm";
import type { PiiKind, PiiMatch } from "./types.ts";

const SCHEMA = {
  type: "object",
  properties: {
    spans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: {
            type: "string",
            enum: ["name", "address", "email", "phone", "iban", "tax-id", "date", "other"],
          },
        },
        required: ["text", "kind"],
      },
    },
  },
  required: ["spans"],
} as const;

export async function llmScan(text: string): Promise<PiiMatch[]> {
  const raw = await askLLM({
    system:
      "You extract personal data from German or English contract text. Return every " +
      "span that is a natural person's name, a postal address, an email address, a " +
      "phone number, an IBAN, a tax identification number, or a date of birth — " +
      "copied EXACTLY as it appears. Do NOT return company names, statute citations " +
      "(e.g. § 535 BGB), headings, or monetary amounts.",
    prompt: text,
    maxTokens: 1024,
    responseSchema: SCHEMA as unknown as Record<string, unknown>,
  });

  try {
    const parsed = JSON.parse(raw) as { spans?: { text?: string; kind?: PiiKind }[] };
    return (parsed.spans ?? [])
      .filter((s) => s.text && s.text.trim())
      .map((s) => ({
        real: s.text!.trim(),
        kind: (s.kind ?? "other") as PiiKind,
        layer: "llm-scan" as const,
      }));
  } catch {
    return [];
  }
}
