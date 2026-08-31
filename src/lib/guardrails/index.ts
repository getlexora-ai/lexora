// Guardrail engine — the small set of legally load-bearing checks a drafted or
// uploaded contract must pass. Pure; node-testable.
//
//   evaluateGuardrails({ contractText, contractType, fields? }) -> GuardrailReport
//   formatGuardrailsForPrompt(report) -> string   (for a repair pass)
//   tierFor(topicKey) -> "guardrail" | "important" | "optional"

export type {
  ClauseTier,
  GuardrailConstraint,
  GuardrailStatus,
  GuardrailFinding,
  GuardrailFields,
  GuardrailReport,
} from "./types.ts";

export {
  GUARDRAIL_RULES,
  tierFor,
  guardrailRuleKeys,
  rulesForScope,
  type GuardrailRule,
} from "./rules.ts";

export { evaluateGuardrails, type EvaluateArgs } from "./evaluate.ts";
export { formatGuardrailsForPrompt } from "./report.ts";
