// Render a guardrail report as a compact block for a repair prompt.

import type { GuardrailFinding, GuardrailReport } from "./types.ts";

function line(f: GuardrailFinding): string {
  return `- [${f.label}] ${f.detail}${f.reference ? ` (${f.reference})` : ""}`;
}

/**
 * Compact prompt block. Hard failures under a "must fix, leave the rest
 * untouched" header; important flags under "HINWEISE:". Empty string when the
 * report is clean.
 */
export function formatGuardrailsForPrompt(report: GuardrailReport): string {
  const out: string[] = [];

  if (report.hardFailures.length > 0) {
    out.push("GUARDRAIL-VERSTÖSSE (nur diese beheben, Rest unverändert lassen):");
    for (const f of report.hardFailures) out.push(line(f));
  }

  if (report.softFlags.length > 0) {
    if (out.length > 0) out.push("");
    out.push("HINWEISE:");
    for (const f of report.softFlags) out.push(line(f));
  }

  return out.join("\n");
}
