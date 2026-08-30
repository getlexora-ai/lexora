// Dev-only. Drives the full pseudonymisation round trip for the playground at
// /dev/pii and reports all four stages so you can see exactly what each layer /
// style does before committing to a design for issue #3.
//
// Not registered in src/proxy.ts (no auth gate) and 404s in production.

import { NextRequest, NextResponse } from "next/server";
import { askLLM } from "@/lib/llm";
import { AppError, errorResponse } from "@/lib/errors";
import {
  auditLeaks,
  auditResidual,
  buildMap,
  collectMatches,
  desanitize,
  sanitize,
  type PiiKind,
  type PseudonymStyle,
} from "@/lib/pii";
import { llmScan } from "@/lib/pii/llm-scan";

type Body = {
  input: string;
  instruction?: string;
  options: {
    layers: { dictionary: boolean; patterns: boolean; llmScan: boolean };
    style: PseudonymStyle;
    germanMorphology: boolean;
    knownValues: { value: string; kind: PiiKind }[];
  };
};

const DEFAULT_INSTRUCTION =
  "You are a German Rechtsanwalt. Using ONLY the facts below, write a short " +
  "(3–5 sentence) excerpt of a residential lease (Wohnraummietvertrag) in German. " +
  "Name the landlord and the tenant, and use each name at least once in the " +
  "genitive (e.g. „… die Wohnung des …“).";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const { input, instruction, options } = (await req.json()) as Body;
    if (!input?.trim()) throw new AppError(400, "empty_input", "Enter some text first.");

    const t0 = Date.now();

    const matches = collectMatches(input, {
      knownValues: options.knownValues ?? [],
      useDictionary: options.layers.dictionary,
      usePatterns: options.layers.patterns,
      germanMorphology: options.germanMorphology,
    });

    let llmScanError: string | null = null;
    if (options.layers.llmScan) {
      try {
        matches.push(...(await llmScan(input)));
      } catch (e) {
        llmScanError = e instanceof Error ? e.message : "L3 scan failed";
        console.error("[pii-roundtrip] llmScan failed:", e);
      }
    }

    const map = buildMap(matches, options.style);
    const sent = sanitize(input, map, options.germanMorphology);

    const llmRaw = await askLLM({
      system: instruction?.trim() || DEFAULT_INSTRUCTION,
      prompt: sent,
      maxTokens: 2048,
    });

    const shown = desanitize(llmRaw, map, options.germanMorphology);

    return NextResponse.json({
      stages: { original: input, sent, llmRaw, shown },
      map: map.entries,
      leaks: auditLeaks(sent, map),
      residual: auditResidual(shown, map),
      meta: { ms: Date.now() - t0, matched: matches.length, mapped: map.entries.length, llmScanError },
    });
  } catch (err) {
    return errorResponse(err, "pii-roundtrip");
  }
}
