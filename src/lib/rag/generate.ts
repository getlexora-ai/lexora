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
export function buildQueries(p: GenerateParams): string[] {
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
- Gliedere in nummerierte Paragraphen (§ 1 Mietobjekt, § 2 Mietzeit, § 3 Miete und Zahlung,
  § 4 Betriebskosten, § 5 Kaution, § 6 Schönheitsreparaturen, § 7 Kleinreparaturen,
  § 8 Nutzung/Untervermietung/Tierhaltung, § 9 Instandhaltung und Modernisierung, § 10 Kündigung,
  § 11 Schlussbestimmungen) und schließe mit Unterschriftszeilen.
- Antworte NUR mit dem Vertragstext, ohne Vorbemerkung.`;

/**
 * Appended to SYSTEM when the caller asks for an English draft. Retrieval and
 * legal reasoning stay in German — only the emitted contract switches language,
 * and every statutory citation stays in its German form.
 */
const ENGLISH_OUTPUT_INSTRUCTION = `

SPRACHE DER AUSGABE / OUTPUT LANGUAGE: English.
- Recherche und rechtliche Prüfung erfolgen weiterhin auf Grundlage des deutschen Rechts (BGB); nur der Vertragstext wird auf Englisch ausgegeben.
- Write the residential lease contract in English.
- Keep every German statutory citation verbatim and in German, e.g. "(§ 551 BGB)", "(§ 556 Abs. 3 BGB)".
- On first use of a German legal term, give it in parentheses after the English wording, e.g. "security deposit (Kaution)", "operating costs (Betriebskosten)", "cosmetic repairs (Schönheitsreparaturen)".
- Paragraph headings in English with the German term in parentheses, e.g. "§ 5 Security Deposit (Kaution)".`;

/** Persona + rules for the drafting model, language-aware. */
export function composeSystem(language: "en" | "de" = "de"): string {
  return language === "en" ? SYSTEM + ENGLISH_OUTPUT_INSTRUCTION : SYSTEM;
}

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

  // The client's own requirements take precedence over the template. The
  // template is only a starting structure; where the two disagree, or the
  // client asks for something the template doesn't cover, the client's wording
  // wins — unless mandatory German law forbids it, in which case the model
  // corrects it and names the norm in the clause.
  const clientBlock = params.keyTerms?.trim()
    ? `MANDANTENVORGABEN (haben Vorrang vor der Vorlage, soweit zwingendes deutsches Recht gewahrt bleibt):

${params.keyTerms.trim()}

=== ENDE MANDANTENVORGABEN ===

`
    : "";

  const templateBlock = params.templateBody?.trim()
    ? `AUSGANGSSTRUKTUR (Vorlage):

${params.templateBody.trim()}

=== ENDE AUSGANGSSTRUKTUR ===

Nutze diese Struktur und Klauseltexte als Ausgangspunkt. Wo die MANDANTENVORGABEN abweichen oder zusätzliche Klauseln verlangen, folge den MANDANTENVORGABEN — es sei denn, zwingendes deutsches Recht steht entgegen; dann korrigiere und benenne die Norm in der Klausel.

`
    : "";

  const prompt = `RECHTSGRUNDLAGEN (nur diese verwenden):

${renderContext(context)}

=== ENDE RECHTSGRUNDLAGEN ===

${clientBlock}${templateBlock}VERTRAGSDATEN:
- Vermieter: ${params.landlord}
- Mieter: ${params.tenant}
- Mietobjekt: ${params.propertyAddress}
- Nettokaltmiete: ${params.baseRentEur} EUR/Monat
- Betriebskostenvorauszahlung: ${params.operatingCostsEur != null ? `${params.operatingCostsEur} EUR/Monat` : "marktüblich ansetzen"}
- Kaution: ${params.depositEur != null ? `${params.depositEur} EUR` : "gesetzliches Maximum nach § 551 BGB ansetzen"}

Erstelle jetzt den vollständigen Wohnraummietvertrag.`;

  const contract = await complete({
    system: composeSystem(params.language),
    prompt,
    maxTokens: 8192,
  });

  return {
    contract,
    groundingRefs: extractStatuteRefs(context),
    context,
  };
}
