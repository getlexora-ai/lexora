// RAG contract generation: retrieve German-tenancy-law context, then draft a
// Wohnraummietvertrag grounded strictly in that context.

import { complete as geminiComplete } from "./gemini.ts";
import { retrieveMany, extractStatuteRefs } from "./retrieve.ts";
import type { GenerateParams, GenerateResult, RetrievalHit } from "./types.ts";

/** A one-shot text completion. The app injects one backed by src/lib/llm.ts. */
export type CompleteFn = (args: {
  system?: string;
  prompt: string;
  maxTokens: number;
}) => Promise<string>;

export type GenerateOptions = {
  /** Override the LLM call. Defaults to the standalone Gemini REST client. */
  complete?: CompleteFn;
};

/**
 * The drafting request is broad, so retrieval runs as several focused sub-queries
 * (one per contract building block) that are merged. Each maps to a corpus doc.
 */
function buildQueries(p: GenerateParams): string[] {
  const qs = [
    "Aufbau und Pflichtinhalte eines Wohnraummietvertrags, Checkliste unwirksame Klauseln",
    "Kaution Höchstbetrag drei Nettokaltmieten Ratenzahlung getrennte Anlage § 551 BGB",
    "Betriebskosten Vorauszahlung Abrechnungsfrist zwölf Monate § 556 BGB BetrKV",
    "Schönheitsreparaturen wirksame Klausel weiche Fristen renoviert übergeben BGH",
    "Kleinreparaturen Einzelobergrenze Jahresobergrenze Bagatellschäden",
    "ordentliche Kündigung Kündigungsfristen Vermieter Mieter § 573 § 573c BGB",
  ];
  if (/vergleichsmiete|mieterh|staffel|index/i.test(p.keyTerms ?? "")) {
    qs.push("Mieterhöhung ortsübliche Vergleichsmiete Kappungsgrenze § 558, Staffelmiete, Indexmiete");
  }
  if (/mietpreisbremse|angespannt/i.test(p.keyTerms ?? "")) {
    qs.push("Mietpreisbremse zulässige Miete zehn Prozent Ausnahmen Auskunftspflicht § 556d BGB");
  }
  if (/tier|hund|katze|haustier/i.test(p.keyTerms ?? "")) {
    qs.push("Tierhaltung Mietwohnung Hunde Katzen Zustimmung Kleintiere BGH");
  }
  if (/unter(ver)?miet|wg|wohngemeinschaft/i.test(p.keyTerms ?? "")) {
    qs.push("Untervermietung Erlaubnis berechtigtes Interesse Teiluntervermietung § 553 BGB");
  }
  if (/befrist|zeitmiet/i.test(p.keyTerms ?? "")) {
    qs.push("befristeter Zeitmietvertrag qualifizierter Befristungsgrund § 575 BGB");
  }
  return qs;
}

function renderContext(hits: RetrievalHit[]): string {
  return hits
    .map((h, i) => `[${i + 1}] ${h.chunk.docTitle} — ${h.chunk.heading}\n${h.chunk.text}`)
    .join("\n\n---\n\n");
}

const SYSTEM = `Du bist Fachanwalt für Miet- und Wohnungseigentumsrecht in Deutschland.
Du entwirfst einen vollständigen, unterschriftsreifen Wohnraummietvertrag nach deutschem Recht (BGB).

Strikte Regeln:
- Stütze jede materielle Klausel ausschließlich auf die unten bereitgestellten RECHTSGRUNDLAGEN. Erfinde keine Paragraphen.
- Nenne bei geldrelevanten Klauseln die einschlägige Norm in Klammern, z. B. "(§ 551 BGB)".
- Halte zwingende Grenzen ein: Kaution höchstens drei Nettokaltmieten und in drei Raten zahlbar (§ 551 BGB);
  Betriebskostenabrechnung binnen zwölf Monaten (§ 556 Abs. 3 BGB); gesetzliche Kündigungsfristen (§ 573c BGB).
- Verwende KEINE nach BGH-Rechtsprechung unwirksamen Klauseln (starre Fristen bei Schönheitsreparaturen,
  Schönheitsreparaturen bei unrenoviert übergebener Wohnung, generelles Tierhaltungsverbot).
- Keine Platzhalter wie [EINFÜGEN]. Nutze die übergebenen Vertragsdaten und sonst marktübliche Standardwerte.
- Gliedere in nummerierte Paragraphen (§ 1 Mietobjekt, § 2 Mietzeit, § 3 Miete, § 4 Betriebskosten,
  § 5 Kaution, § 6 Schönheitsreparaturen, § 7 Kleinreparaturen, § 8 Nutzung/Untervermietung, § 9 Kündigung,
  § 10 Schlussbestimmungen) und schließe mit Unterschriftszeilen.
- Antworte NUR mit dem Vertragstext, ohne Vorbemerkung.`;

/**
 * Draft a Germany-curated residential lease. Retrieval is grounded on the
 * pgvector store; generation is instructed to cite only what it was given.
 */
export async function generateGermanRentalContract(
  params: GenerateParams,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const complete = opts.complete ?? geminiComplete;

  const context = await retrieveMany(buildQueries(params), {
    topK: params.topK ?? 12,
  });

  const prompt = `RECHTSGRUNDLAGEN (nur diese verwenden):

${renderContext(context)}

=== ENDE RECHTSGRUNDLAGEN ===

VERTRAGSDATEN:
- Vermieter: ${params.landlord}
- Mieter: ${params.tenant}
- Mietobjekt: ${params.propertyAddress}
- Nettokaltmiete: ${params.baseRentEur} EUR/Monat
- Betriebskostenvorauszahlung: ${params.operatingCostsEur != null ? `${params.operatingCostsEur} EUR/Monat` : "marktüblich ansetzen"}
- Kaution: ${params.depositEur != null ? `${params.depositEur} EUR` : "gesetzliches Maximum nach § 551 BGB ansetzen"}
${params.keyTerms ? `- Weitere Vorgaben des Mandanten: ${params.keyTerms}` : ""}

Erstelle jetzt den vollständigen Wohnraummietvertrag.`;

  const contract = await complete({ system: SYSTEM, prompt, maxTokens: 8192 });

  return {
    contract,
    groundingRefs: extractStatuteRefs(context),
    context,
  };
}
