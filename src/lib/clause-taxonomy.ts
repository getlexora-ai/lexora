// The single German §-taxonomy shared by the clause library, templates and
// playbooks. Pure data + pure helpers only — NO `@/` imports, NO next/server —
// so `node --test` can import this file directly (see src/lib/analysis.ts:1-7
// for why that constraint exists).
//
// `key` is the stable identifier stored in the DB (`clause_library.clause_type`,
// `playbook_rules.clause_type`, a template section's `clause_type`). `para` is
// the paragraph number in the curated Standard-Wohnraummietvertrag
// (src/lib/rag/corpus/22-standard-wohnraummietvertrag-vorlage.md) — null for
// topics that are not a numbered § in that template.

export type ClauseTopic = {
  key: string;
  de: string;
  en: string;
  /** Paragraph number in the curated standard lease, or null. */
  para: number | null;
  /** True for the residential-lease §-structure; false for the generic set. */
  lease: boolean;
};

export const CLAUSE_TOPICS: ClauseTopic[] = [
  { key: "mietobjekt",            de: "Mietobjekt",                           en: "Leased property",             para: 1,  lease: true },
  { key: "mietzeit",              de: "Mietzeit / Befristung",                en: "Term",                        para: 2,  lease: true },
  { key: "miete",                 de: "Miete und Zahlung",                    en: "Rent & payment",              para: 3,  lease: true },
  { key: "betriebskosten",        de: "Betriebskosten",                      en: "Operating costs",             para: 4,  lease: true },
  { key: "kaution",               de: "Kaution",                              en: "Security deposit",            para: 5,  lease: true },
  { key: "schoenheitsreparaturen", de: "Schönheitsreparaturen",              en: "Cosmetic repairs",            para: 6,  lease: true },
  { key: "kleinreparaturen",      de: "Kleinreparaturen",                    en: "Minor repairs",               para: 7,  lease: true },
  { key: "nutzung",               de: "Nutzung, Untervermietung, Tierhaltung", en: "Use, subletting, pets",     para: 8,  lease: true },
  { key: "instandhaltung",        de: "Instandhaltung, Mängel, Modernisierung", en: "Maintenance & modernisation", para: 9, lease: true },
  { key: "kuendigung",            de: "Kündigung",                            en: "Termination",                 para: 10, lease: true },
  { key: "schlussbestimmungen",   de: "Schlussbestimmungen",                 en: "Final provisions",            para: 11, lease: true },
  { key: "uebergabe",             de: "Übergabe und Rückgabe",               en: "Handover & return",           para: null, lease: true },
  // Generic commercial topics, for the nine non-lease CONTRACT_TYPES in
  // src/components/create-contract-modal.tsx.
  { key: "haftung",               de: "Haftung",                             en: "Liability",                   para: null, lease: false },
  { key: "vertraulichkeit",       de: "Vertraulichkeit",                     en: "Confidentiality",             para: null, lease: false },
  { key: "ip",                    de: "Rechte am Arbeitsergebnis / IP",       en: "Intellectual property",       para: null, lease: false },
  { key: "verguetung",            de: "Vergütung",                           en: "Remuneration",                para: null, lease: false },
  { key: "datenschutz",           de: "Datenschutz",                         en: "Data protection",             para: null, lease: false },
  { key: "rechtswahl",            de: "Rechtswahl und Gerichtsstand",         en: "Governing law & venue",       para: null, lease: false },
  { key: "sonstiges",             de: "Sonstiges",                           en: "Other",                       para: null, lease: false },
];

const BY_KEY: Map<string, ClauseTopic> = new Map(CLAUSE_TOPICS.map((t) => [t.key, t]));

/** The catch-all topic; `guessTopic` falls back to this. */
export const FALLBACK_TOPIC = "sonstiges";

export function isKnownTopic(key: string): boolean {
  return BY_KEY.has(key);
}

export function getTopic(key: string): ClauseTopic | undefined {
  return BY_KEY.get(key);
}

/** Human label for a topic key, in the given language. Unknown → the key itself. */
export function topicLabel(key: string, lang: "de" | "en" = "de"): string {
  const t = BY_KEY.get(key);
  if (!t) return key;
  return lang === "en" ? t.en : t.de;
}

// ── guessTopic ──────────────────────────────────────────────────────────────
// Best-effort mapping of a free-text clause/section title ("§ 5 Kaution",
// "Clause 3: Limitation of Liability") to a topic key. It only ever PRE-FILLS a
// filter the user can clear or DECORATES a card — never used to make a
// binding decision (see the plan's risk table).

const TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/kaution|deposit|mietsicherheit|mietkaution/i, "kaution"],
  [/schönheitsrep|schoenheitsrep|cosmetic repair|renovier/i, "schoenheitsreparaturen"],
  [/kleinrep|minor repair|bagatell/i, "kleinreparaturen"],
  [/betriebskost|nebenkost|operating cost|service charge|utilities/i, "betriebskosten"],
  [/schlussbestimm|salvatorisch|severab|final provision|miscellaneous|entire agreement/i, "schlussbestimmungen"],
  [/kündig|kuendig|terminat|notice period|laufzeit .* beend/i, "kuendigung"],
  [/untervermiet|sublet|sublease|tierhaltung|haustier|pet|nutzung|use of (the )?premises/i, "nutzung"],
  [/instandhalt|modernisier|mangel|mängel|maintenance|defect|repair obligation/i, "instandhaltung"],
  [/übergabe|uebergabe|rückgabe|ruckgabe|handover|hand-over|move-in|move-out|inventory/i, "uebergabe"],
  [/mietzeit|mietbeginn|befristung|vertragslaufzeit|\bterm\b|duration|commencement/i, "mietzeit"],
  [/mietobjekt|mietgegenstand|mietsache|leased (property|premises)|demised premises|description of/i, "mietobjekt"],
  [/\bmiete\b|nettokaltmiete|mietzins|staffelmiete|indexmiete|\brent\b|mieterhöh/i, "miete"],
  [/haftung|liability|limitation of liab|indemnif|gewährleistung|warrant/i, "haftung"],
  [/vertraulich|geheimhalt|confidential|non-disclosure|\bnda\b/i, "vertraulichkeit"],
  [/urheber|schutzrecht|arbeitsergebnis|intellectual property|\bip\b|work product/i, "ip"],
  [/vergütung|verguetung|honorar|entgelt|remuneration|compensation|fees?|payment terms/i, "verguetung"],
  [/datenschutz|data protection|\bdsgvo\b|\bgdpr\b|processing of personal data/i, "datenschutz"],
  [/rechtswahl|gerichtsstand|anwendbares recht|governing law|jurisdiction|venue|dispute resolution|arbitration/i, "rechtswahl"],
];

export function guessTopic(title: string | null | undefined): string {
  if (!title) return FALLBACK_TOPIC;
  for (const [re, key] of TITLE_PATTERNS) {
    if (re.test(title)) return key;
  }
  return FALLBACK_TOPIC;
}

// ── DOC_TO_TOPIC ────────────────────────────────────────────────────────────
// Maps every curated RAG corpus doc (src/lib/rag/corpus/NN-*.md) to the topic
// its `## Musterformulierung` clause belongs to. The seed script
// (scripts/seed-library.mjs) hard-errors on an unmapped doc id, so a new corpus
// file cannot silently seed as "sonstiges".
//
// Docs without a model clause (00 overview, 22 template, 23 checklist) are
// intentionally absent — the seeder skips the Musterformulierung pass for them.

export const DOC_TO_TOPIC: Record<string, string> = {
  "01-hauptpflichten-535":                 "instandhaltung",
  "02-mietmangel-minderung-536":           "instandhaltung",
  "03-kaution-551":                        "kaution",
  "04-betriebskosten-556-betrkv":          "betriebskosten",
  "05-mieterhoehung-vergleichsmiete-558":  "miete",
  "06-mietpreisbremse-556d":               "miete",
  "07-staffelmiete-557a":                  "miete",
  "08-indexmiete-557b":                    "miete",
  "09-modernisierung-555b-559":            "instandhaltung",
  "10-schoenheitsreparaturen":             "schoenheitsreparaturen",
  "11-kleinreparaturen":                   "kleinreparaturen",
  "12-ordentliche-kuendigung-vermieter-573": "kuendigung",
  "13-kuendigungsfristen-573c":            "kuendigung",
  "14-fristlose-kuendigung-543-569":       "kuendigung",
  "15-eigenbedarf-573-2-2":                "kuendigung",
  "16-untervermietung-540-553":            "nutzung",
  "17-tierhaltung":                        "nutzung",
  "18-zeitmietvertrag-575":                "mietzeit",
  "19-uebergabe-ruckgabe-protokoll":       "uebergabe",
  "20-umwandlung-577-577a":                "schlussbestimmungen",
  "21-hausordnung-nutzung":                "nutzung",
};

/** Corpus docs that carry no model clause — the Musterformulierung pass skips them. */
export const DOCS_WITHOUT_MODEL_CLAUSE = new Set([
  "00-ueberblick-wohnraummietrecht",
  "22-standard-wohnraummietvertrag-vorlage",
  "23-mietvertrag-checkliste",
]);

/** Topic key for a given curated-lease paragraph number (1–11), or undefined. */
export function topicForParagraph(para: number): string | undefined {
  return CLAUSE_TOPICS.find((t) => t.lease && t.para === para)?.key;
}
