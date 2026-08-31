// ─────────────────────────────────────────────────────────────────────────────
//  Guardrail check — run the clause-guardrail engine against a contract.
//
//   node scripts/guardrail-check.mjs path/to/contract.txt
//   node scripts/guardrail-check.mjs "…contract text…"
//   cat contract.txt | node scripts/guardrail-check.mjs
//   node scripts/guardrail-check.mjs contract.txt --rent 1200 --deposit 5000 --type "Lease Agreement"
//   node scripts/guardrail-check.mjs contract.txt --json
//
//  No server, no DB, no LLM — pure `src/lib/guardrails`. The fast loop for
//  tuning the rules in src/lib/guardrails/rules.ts: paste real contract text,
//  see what fails, tweak, re-run. Exits non-zero when a HARD guardrail fails,
//  so it can gate a script over a folder of fixtures.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { evaluateGuardrails } from "../src/lib/guardrails/index.ts";

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);

const positional = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true);

let text = "";
if (positional && existsSync(positional)) text = readFileSync(positional, "utf8");
else if (positional) text = positional;
else if (!process.stdin.isTTY) text = readFileSync(0, "utf8");

if (!text.trim()) {
  console.error("Usage: node scripts/guardrail-check.mjs <file|text> [--rent N] [--deposit N] [--type T] [--json]");
  process.exit(2);
}

const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : undefined);

const report = evaluateGuardrails({
  contractText: text,
  contractType: flag("type", "Lease Agreement"),
  fields: {
    baseRentEur: num(flag("rent")),
    operatingCostsEur: num(flag("costs")),
    depositEur: num(flag("deposit")),
  },
  language: flag("lang", "de"),
});

if (has("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = { ok: "✓", missing: "·", violation: "✗", unchecked: "?" };
  console.log(`\ncontract type : ${report.contractType}`);
  console.log(`guardrails ok : ${report.ok ? "yes" : "NO"}\n`);
  for (const f of report.findings) {
    const tier = f.tier === "guardrail" ? "HARD" : "soft";
    console.log(`  ${mark[f.status] ?? "?"} [${tier}] ${f.label} — ${f.status}`);
    if (f.status === "violation" || f.status === "missing") {
      console.log(`      ${f.detail}${f.reference ? `  (${f.reference})` : ""}`);
    }
  }
  console.log(
    `\n${report.hardFailures.length} hard failure(s), ${report.softFlags.length} soft flag(s).`,
  );
}

process.exit(report.ok ? 0 : 1);
