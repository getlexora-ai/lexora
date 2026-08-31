// The guardrail policy: which clause topics are legally load-bearing for a
// German residential lease, and the machine checks on each.
//
// Kept HERE rather than in src/lib/clause-taxonomy.ts on purpose — the taxonomy
// is the shared vocabulary (library, templates, playbooks all key off it); the
// guardrail *policy* is this module's concern and evolves with the analyser.
// `tierFor()` / `guardrailRuleKeys()` are the read helpers the rest of the app
// should use.

import type { ClauseTier, GuardrailConstraint } from "./types.ts";

export type GuardrailRule = {
  /** clause-taxonomy key */
  topic: string;
  tier: Exclude<ClauseTier, "optional">;
  /** true = residential-lease scope (contractType "Lease Agreement") */
  lease: boolean;
  /** body-text probe OR-ed with the heading scan when deciding "is this topic present" */
  presenceHint?: RegExp;
  constraints: GuardrailConstraint[];
};

/**
 * Deliberately small and high-precision. A `guardrail`-tier failure blocks /
 * flags hard; an `important`-tier failure is a soft hint. Missing an `important`
 * topic is a soft flag; missing a `guardrail` topic that only carries a
 * `presence` check is a hard failure.
 */
export const GUARDRAIL_RULES: GuardrailRule[] = [
  {
    topic: "mietobjekt",
    tier: "guardrail",
    lease: true,
    presenceHint:
      /Mietobjekt|Mietgegenstand|Mietsache|Mietr(ä|ae)ume|vermietet wird|Gegenstand des Mietvertrages/i,
    constraints: [
      { kind: "presence", message: "Das Mietobjekt ist im Vertrag nicht bezeichnet." },
    ],
  },
  {
    topic: "miete",
    tier: "guardrail",
    lease: true,
    presenceHint:
      /Nettokaltmiete|Grundmiete|Kaltmiete|monatliche Miete|Miete betr(ä|ae)gt|Mietzins|Gesamtmiete/i,
    constraints: [
      { kind: "presence", message: "Die Höhe der Miete ist nicht angegeben." },
    ],
  },
  {
    topic: "kaution",
    tier: "guardrail",
    lease: true,
    presenceHint: /Kaution|Mietsicherheit|Mietkaution|Barkaution|Sicherheitsleistung/i,
    constraints: [
      {
        kind: "deposit-cap",
        multiple: 3,
        ofField: "baseRentEur",
        targetField: "depositEur",
        message: "Die Kaution übersteigt drei Nettokaltmieten.",
        reference: "§ 551 Abs. 1 BGB",
      },
      {
        kind: "forbidden-pattern",
        pattern:
          "(vier|4|f(ü|ue)nf|5|sechs|6)\\s+(Nettokaltmieten|Monatsmieten|Kaltmieten|Monatsnettomieten|Monatsmiete)",
        flags: "i",
        message: "Die Kaution ist auf mehr als drei Nettokaltmieten festgelegt.",
        reference: "§ 551 Abs. 1 BGB",
      },
    ],
  },
  {
    topic: "betriebskosten",
    tier: "important",
    lease: true,
    presenceHint: /Betriebskosten|Nebenkosten|kalte Betriebskosten|Betriebskostenvorauszahlung/i,
    constraints: [
      {
        kind: "required-pattern",
        pattern:
          "(zw(ö|oe)lf|12)\\s*Monat|Abrechnungsfrist|j(ä|ae)hrlich abzurechnen|einmal j(ä|ae)hrlich|jahresabrechnung",
        flags: "i",
        message: "Die Betriebskostenabrechnung nennt keine Abrechnungsfrist von zwölf Monaten.",
        reference: "§ 556 Abs. 3 BGB",
      },
    ],
  },
  {
    topic: "kuendigung",
    tier: "important",
    lease: true,
    presenceHint: /K(ü|ue)ndigung/i,
    constraints: [
      { kind: "presence", message: "Der Vertrag enthält keine Regelung zur Kündigung." },
      {
        kind: "required-pattern",
        pattern: "K(ü|ue)ndigungsfrist|§\\s*573c|drei Monat(e|en)?|gesetzliche(n)? Frist",
        flags: "i",
        message: "Die Kündigungsregelung nennt keine Kündigungsfrist.",
        reference: "§ 573c BGB",
      },
      {
        kind: "forbidden-pattern",
        pattern:
          "K(ü|ue)ndigung(srecht)?\\s+(ist\\s+)?(beidseitig\\s+)?ausgeschlossen[^.]{0,80}(f(ü|ue)nf|sechs|sieben|acht|neun|zehn|5|6|7|8|9|10)\\s*Jahr",
        flags: "i",
        message: "Der Kündigungsausschluss überschreitet die zulässige Höchstdauer von vier Jahren.",
        reference: "§ 557a Abs. 3 BGB (analog) / BGH",
      },
    ],
  },
  {
    topic: "schoenheitsreparaturen",
    tier: "important",
    lease: true,
    constraints: [
      {
        kind: "forbidden-pattern",
        pattern:
          "(starre|feste)\\s+Frist|sp(ä|ae)testens\\s+(alle\\s+)?(drei|3|f(ü|ue)nf|5|sieben|7)\\s+Jahr|alle\\s+(drei|3)\\s+Jahre\\s+(auszuf(ü|ue)hren|vorzunehmen|durchzuf(ü|ue)hren|renoviert)",
        flags: "i",
        message: "Starre Fristen für Schönheitsreparaturen sind unwirksam.",
        reference: "§ 307 BGB (BGH)",
      },
    ],
  },
  {
    topic: "kleinreparaturen",
    tier: "important",
    lease: true,
    constraints: [
      {
        kind: "forbidden-pattern",
        pattern:
          "Kleinreparaturen[\\s\\S]{0,240}?(unbegrenzt|ohne\\s+(betragsm(ä|ae)(ß|ss)ige\\s+)?(Begrenzung|H(ö|oe)chstgrenze|Obergrenze)|in\\s+voller\\s+H(ö|oe)he|s(ä|ae)mtliche\\s+Kleinreparaturen)",
        flags: "i",
        message: "Kleinreparaturen ohne betragsmäßige Obergrenze sind unwirksam.",
        reference: "§ 307 BGB (BGH)",
      },
    ],
  },
];

const BY_TOPIC = new Map(GUARDRAIL_RULES.map((r) => [r.topic, r]));

/** Tier of a taxonomy key: "guardrail" / "important" if it carries a rule, else "optional". */
export function tierFor(key: string): ClauseTier {
  return BY_TOPIC.get(key)?.tier ?? "optional";
}

/** Keys of the hard-guardrail topics in scope for the given lease flag. */
export function guardrailRuleKeys(opts: { lease?: boolean } = {}): string[] {
  const lease = opts.lease ?? true;
  return GUARDRAIL_RULES.filter((r) => r.lease === lease && r.tier === "guardrail").map((r) => r.topic);
}

/** Every rule (guardrail + important) in scope for the given lease flag. */
export function rulesForScope(opts: { lease?: boolean } = {}): GuardrailRule[] {
  const lease = opts.lease ?? true;
  return GUARDRAIL_RULES.filter((r) => r.lease === lease);
}
