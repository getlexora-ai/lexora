// Guardrail types. Pure — NO `@/` imports, NO next/server — so `node --test`
// can import the guardrails module directly (same rule as src/lib/clause-taxonomy.ts).

export type ClauseTier = "guardrail" | "important" | "optional";

/**
 * A machine-checkable rule attached to a clause topic.
 * - `presence`         — the topic must appear somewhere in the contract
 * - `deposit-cap`      — a numeric field must not exceed `multiple` × another field
 * - `forbidden-pattern`— a regex that must NOT match the contract text
 * - `required-pattern` — a regex that MUST match, but only once the topic is present
 */
export type GuardrailConstraint =
  | { kind: "presence"; message: string; reference?: string }
  | {
      kind: "deposit-cap";
      multiple: number;
      ofField: string;
      targetField: string;
      message: string;
      reference?: string;
    }
  | { kind: "forbidden-pattern"; pattern: string; flags?: string; message: string; reference?: string }
  | { kind: "required-pattern"; pattern: string; flags?: string; message: string; reference?: string };

export type GuardrailStatus = "ok" | "missing" | "violation" | "unchecked";

export type GuardrailFinding = {
  /** taxonomy key */
  topic: string;
  /** topicLabel(topic, language) */
  label: string;
  tier: "guardrail" | "important";
  status: GuardrailStatus;
  /** human sentence, in `language` (constraint messages are authored in German) */
  detail: string;
  /** statute, e.g. "§ 551 Abs. 1 BGB" */
  reference?: string;
};

export type GuardrailFields = {
  baseRentEur?: number;
  operatingCostsEur?: number;
  depositEur?: number;
  [k: string]: number | string | undefined;
};

export type GuardrailReport = {
  contractType: string;
  /** one per guardrail + important topic in scope for the type */
  findings: GuardrailFinding[];
  /** tier === "guardrail" && (status === "missing" || "violation") */
  hardFailures: GuardrailFinding[];
  /** tier === "important" && (status === "missing" || "violation") */
  softFlags: GuardrailFinding[];
  /** hardFailures.length === 0 */
  ok: boolean;
};
