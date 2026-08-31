// Evaluate the guardrail policy against a drafted / uploaded contract.
//
// Pure: no I/O, no model call. `src/lib/clause-taxonomy.ts` supplies only the
// shared vocabulary (labels + the best-effort heading→topic guesser); the policy
// itself lives in ./rules.ts.

import { topicLabel, guessTopic } from "../clause-taxonomy.ts";
import type {
  GuardrailConstraint,
  GuardrailFields,
  GuardrailFinding,
  GuardrailReport,
  GuardrailStatus,
} from "./types.ts";
import { rulesForScope, type GuardrailRule } from "./rules.ts";

const STATUS_RANK: Record<GuardrailStatus, number> = {
  ok: 0,
  unchecked: 1,
  missing: 2,
  violation: 3,
};

function worse(a: GuardrailStatus, b: GuardrailStatus): GuardrailStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function finite(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

/** "1.234,56" / "1.234" / "1234,56" / "1234" → number. */
function parseEurNumber(raw: string): number {
  let s = raw.replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** First EUR amount within ~180 chars of a keyword match. */
function amountNear(text: string, keyword: RegExp): number | undefined {
  const re = new RegExp(keyword.source, keyword.flags.includes("g") ? keyword.flags : keyword.flags + "g");
  const AMOUNT =
    /(?:EUR|€)\s*([0-9][0-9.\s]*(?:,\d{1,2})?)|([0-9][0-9.\s]*(?:,\d{1,2})?)\s*(?:EUR|€|Euro)/i;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const window = text.slice(m.index, m.index + 180);
    const a = window.match(AMOUNT);
    if (a) {
      const n = parseEurNumber((a[1] ?? a[2] ?? "").trim());
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return undefined;
}

const DEPOSIT_KW = /Kaution|Mietsicherheit|Mietkaution|Barkaution|Sicherheitsleistung/i;
const RENT_KW = /Nettokaltmiete|Grundmiete|Kaltmiete|Mietzins|monatliche Miete|Miete betr(ä|ae)gt/i;

/** Topic keys the contract appears to address (heading scan + per-rule body probe). */
function presentTopics(text: string, rules: GuardrailRule[]): Set<string> {
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 90) continue;
    const headingish =
      /^#{1,4}\s+\S/.test(line) ||
      /^\s*(#{1,4}\s*)?(§\s*\d+|\d+[.)]|[IVX]+\.)?\s*\p{Lu}/u.test(raw);
    if (!headingish) continue;
    seen.add(guessTopic(line.replace(/^#{1,4}\s*/, "")));
  }

  for (const r of rules) {
    if (r.presenceHint && r.presenceHint.test(text)) seen.add(r.topic);
  }
  return seen;
}

type ConEval = { status: GuardrailStatus; detail: string; reference?: string };

function evalConstraint(
  c: GuardrailConstraint,
  ctx: { text: string; present: boolean; fields: GuardrailFields },
): ConEval {
  switch (c.kind) {
    case "presence":
      return { status: ctx.present ? "ok" : "missing", detail: c.message, reference: c.reference };

    case "forbidden-pattern": {
      const hit = new RegExp(c.pattern, c.flags ?? "i").test(ctx.text);
      return { status: hit ? "violation" : "ok", detail: c.message, reference: c.reference };
    }

    case "required-pattern": {
      if (!ctx.present) return { status: "unchecked", detail: c.message, reference: c.reference };
      const hit = new RegExp(c.pattern, c.flags ?? "i").test(ctx.text);
      return { status: hit ? "ok" : "violation", detail: c.message, reference: c.reference };
    }

    case "deposit-cap": {
      const target =
        finite(ctx.fields[c.targetField]) || (amountNear(ctx.text, DEPOSIT_KW) ?? NaN);
      const basis = finite(ctx.fields[c.ofField]) || (amountNear(ctx.text, RENT_KW) ?? NaN);
      if (!Number.isFinite(target) || !Number.isFinite(basis) || basis <= 0) {
        return { status: "unchecked", detail: c.message, reference: c.reference };
      }
      const cap = c.multiple * basis;
      if (target > cap + 0.01) {
        return {
          status: "violation",
          detail: `${c.message} (${Math.round(target)} EUR bei ${Math.round(basis)} EUR Kaltmiete, zulässig max. ${Math.round(cap)} EUR)`,
          reference: c.reference,
        };
      }
      return { status: "ok", detail: c.message, reference: c.reference };
    }
  }
}

export type EvaluateArgs = {
  contractText: string;
  contractType: string;
  fields?: GuardrailFields;
  language?: "de" | "en";
};

export function evaluateGuardrails(args: EvaluateArgs): GuardrailReport {
  const { contractText, contractType, fields = {}, language = "de" } = args;
  const lease = contractType === "Lease Agreement";
  const rules = rulesForScope({ lease });

  if (rules.length === 0) {
    return { contractType, findings: [], hardFailures: [], softFlags: [], ok: true };
  }

  const present = presentTopics(contractText, rules);

  const findings: GuardrailFinding[] = rules.map((r) => {
    const ctx = { text: contractText, present: present.has(r.topic), fields };

    let status: GuardrailStatus = "ok";
    let detail = "";
    let reference: string | undefined;

    for (const c of r.constraints) {
      const e = evalConstraint(c, ctx);
      if (STATUS_RANK[e.status] >= STATUS_RANK[status] && e.status !== "ok") {
        status = worse(status, e.status);
        detail = e.detail;
        reference = e.reference;
      } else {
        status = worse(status, e.status);
      }
    }
    if (status === "ok") {
      detail =
        r.constraints[0]?.kind === "presence"
          ? `${topicLabel(r.topic, language)} ist geregelt.`
          : `${topicLabel(r.topic, language)}: keine Beanstandung.`;
    } else if (status === "unchecked") {
      detail = `${topicLabel(r.topic, language)}: nicht prüfbar (keine Angaben).`;
    }

    return {
      topic: r.topic,
      label: topicLabel(r.topic, language),
      tier: r.tier,
      status,
      detail,
      reference: reference ?? r.constraints[0]?.reference,
    };
  });

  const hardFailures = findings.filter(
    (f) => f.tier === "guardrail" && (f.status === "missing" || f.status === "violation"),
  );
  const softFlags = findings.filter(
    (f) => f.tier === "important" && (f.status === "missing" || f.status === "violation"),
  );

  return { contractType, findings, hardFailures, softFlags, ok: hardFailures.length === 0 };
}
