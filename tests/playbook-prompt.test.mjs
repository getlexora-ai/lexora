// Wave 4 — playbook-aware prompt construction and the pure coercion helpers.
// No network, no key.  node --test tests/playbook-prompt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  reviewPrompt,
  renderPlaybookBlock,
  ruleIdForTag,
  coerceIssues,
  coerceCoverage,
} from "../src/lib/analysis.ts";

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

// A small, representative rule set.
const RULES = [
  {
    id: "rule-kaution",
    clause_type: "kaution",
    topic: "Kaution",
    acceptable: "Höchstens drei Nettokaltmieten, Ratenzahlung zulässig.",
    fallback: "Zwei Nettokaltmieten ohne Ratenzahlung.",
    unacceptable: "Mehr als drei Nettokaltmieten oder fällig vor Übergabe.",
    rationale: "§ 551 BGB begrenzt die Mietsicherheit.",
    reference: "§ 551 Abs. 1 BGB",
    severity: "high",
    is_required: false,
  },
  {
    id: "rule-schoenheit",
    clause_type: "schoenheitsreparaturen",
    topic: "Schönheitsreparaturen",
    acceptable: "Weiche Fristen, nur bei renovierter Übergabe.",
    unacceptable: "Starre Fristen, Endrenovierung oder Quotenabgeltung.",
    severity: "medium",
    is_required: false,
  },
  {
    id: "rule-mietobjekt",
    clause_type: "mietobjekt",
    topic: "Mietobjekt",
    acceptable: "Wohnung, Lage, Räume und Schlüsselzahl genau bezeichnet.",
    unacceptable: "Mietobjekt nicht oder nur unbestimmt bezeichnet.",
    severity: "high",
    is_required: true,
  },
];

// ── 1. byte-identical no-playbook lock ──────────────────────────────────────
test("reviewPrompt() with no rules is byte-identical to the captured copy", () => {
  assert.equal(reviewPrompt("de"), fixture("review-prompt-de.txt"));
  assert.equal(reviewPrompt(), fixture("review-prompt-de.txt"));
  assert.equal(reviewPrompt("en"), fixture("review-prompt-en.txt"));
  // an empty rule set is treated as "no playbook"
  assert.equal(reviewPrompt("de", []), fixture("review-prompt-de.txt"));
});

// ── 2. with rules: keeps every germany-only assertion + adds the block ──────
test("reviewPrompt(lang, rules) still satisfies the germany-only assertions", () => {
  for (const lang of ["de", "en"]) {
    const p = reviewPrompt(lang, RULES);
    assert.ok(/Fachanwalt/.test(p), "reviewer is a German Fachanwalt");
    assert.ok(/GERMAN LAW/.test(p));
    assert.ok(/§§ 305[–-]310 BGB/.test(p), "AGB-Kontrolle cited");
    assert.ok(/mietrechtliche Spezialnormen/.test(p));
    assert.ok(/MUST cite the relevant norm/.test(p));
    assert.ok(/reference:/.test(p), "the optional reference field is still described");
  }
});

test("reviewPrompt(lang, rules) inserts the PRÜFMASSSTAB block before the Document marker", () => {
  const p = reviewPrompt("de", RULES);
  assert.ok(p.includes("PRÜFMASSSTAB — PLAYBOOK"));
  assert.ok(p.indexOf("PRÜFMASSSTAB") < p.indexOf("\n\nDocument:\n"), "block is above Document:");
  assert.ok(p.indexOf("- Write the \"issue\"") < p.indexOf("PRÜFMASSSTAB"), "block is below the rules list");
  // the "how many issues" line switched
  assert.ok(!/Return 5-8 issues/.test(p));
  assert.ok(/Return one issue per breached rule/.test(p));
  assert.ok(/violates mandatory German law even if no rule covers it/.test(p));
  // every rule's unacceptable position is present
  for (const r of RULES) assert.ok(p.includes(r.unacceptable), `contains: ${r.unacceptable}`);
  // rule tags are assigned in input order
  assert.ok(p.includes("[R1] Kaution"));
  assert.ok(p.includes("[R3] Mietobjekt — severity: high — required: yes"));
});

// ── 3. renderPlaybookBlock truncation is deterministic ─────────────────────
test("renderPlaybookBlock truncates by dropping the highest-index rules first", () => {
  const full = renderPlaybookBlock(RULES);
  assert.ok(full.includes("[R3] Mietobjekt"));

  const tight = renderPlaybookBlock(RULES, 520);
  assert.equal(tight, renderPlaybookBlock(RULES, 520), "deterministic for the same input");
  assert.ok(tight.length <= 520, "respects the cap");
  assert.ok(tight.includes("[R1] Kaution"), "keeps the lowest-index rule");
  assert.ok(!tight.includes("[R2] Schönheitsreparaturen"), "drops higher-index rules");
  assert.ok(!tight.includes("[R3] Mietobjekt"), "drops the highest-index rule");
  assert.ok(/playbook truncated: \d+ of 3 rules shown/.test(tight));
});

test("ruleIdForTag maps R-tags back to ids", () => {
  assert.equal(ruleIdForTag(RULES, "R1"), "rule-kaution");
  assert.equal(ruleIdForTag(RULES, "R3"), "rule-mietobjekt");
  assert.equal(ruleIdForTag(RULES, "r2"), "rule-schoenheit");
  assert.equal(ruleIdForTag(RULES, "R9"), undefined);
  assert.equal(ruleIdForTag(RULES, "nonsense"), undefined);
});

// ── 4. coerceIssues carries / drops rule_id + verdict ─────────────────────
test("coerceIssues keeps a known rule_id (id or R-tag) and a valid verdict, drops the rest", () => {
  const parsed = {
    issues: [
      {
        passage: "Kaution in Höhe von vier Monatsmieten",
        type: "high",
        clause: "§ 5 Kaution",
        issue: "Kaution übersteigt drei Nettokaltmieten (§ 551 BGB)",
        suggestion: "Die Kaution beträgt höchstens drei Nettokaltmieten.",
        rule_id: "R1",
        verdict: "redline",
      },
      {
        passage: "Schönheitsreparaturen alle drei Jahre",
        type: "medium",
        clause: "§ 6",
        issue: "Starre Fristen — unwirksam",
        suggestion: "Der Mieter führt Schönheitsreparaturen nach Bedarf aus.",
        rule_id: "rule-schoenheit",
        verdict: "not-a-verdict",
      },
      {
        passage: "Irgendeine Klausel",
        type: "low",
        clause: "§ 9",
        issue: "…",
        suggestion: "…",
        rule_id: "rule-does-not-exist",
      },
    ],
  };

  const issues = coerceIssues(parsed, RULES);
  assert.equal(issues.length, 3);
  assert.equal(issues[0].rule_id, "rule-kaution", "R1 tag resolved to the id");
  assert.equal(issues[0].verdict, "redline");
  assert.equal(issues[1].rule_id, "rule-schoenheit");
  assert.ok(!("verdict" in issues[1]), "invalid verdict dropped");
  assert.ok(!("rule_id" in issues[2]), "unknown rule_id dropped");
});

test("coerceIssues without a rule set ignores rule_id entirely (back-compat)", () => {
  const parsed = {
    issues: [{
      passage: "p", type: "high", clause: "c", issue: "i", suggestion: "s",
      rule_id: "R1", verdict: "redline",
    }],
  };
  const issues = coerceIssues(parsed);
  assert.equal(issues.length, 1);
  assert.ok(!("rule_id" in issues[0]));
  assert.ok(!("verdict" in issues[0]));
});

// ── 5. coerceCoverage marks an uncovered required rule "missing" ──────────
test("coerceCoverage: required rule with no finding => missing; others => meets/verdict", () => {
  const parsed = {
    issues: [
      { passage: "p", type: "high", clause: "c", issue: "i", suggestion: "s", rule_id: "R1", verdict: "redline" },
      { passage: "p", type: "low", clause: "c", issue: "i", suggestion: "s", rule_id: "R2", verdict: "fallback" },
    ],
    // R3 (Mietobjekt, required) is neither flagged nor listed as missing
  };
  const cov = coerceCoverage(parsed, RULES);
  assert.equal(cov.length, 3);
  const byId = Object.fromEntries(cov.map((c) => [c.rule_id, c.verdict]));
  assert.equal(byId["rule-kaution"], "redline");
  assert.equal(byId["rule-schoenheit"], "fallback");
  assert.equal(byId["rule-mietobjekt"], "missing", "required + no finding => missing");
});

test("coerceCoverage: honours the model's missing_topics list", () => {
  const parsed = { issues: [], missing_topics: [{ rule_id: "R1", topic: "Kaution", severity: "high" }] };
  const cov = coerceCoverage(parsed, RULES);
  const byId = Object.fromEntries(cov.map((c) => [c.rule_id, c.verdict]));
  assert.equal(byId["rule-kaution"], "missing", "explicitly reported missing");
  assert.equal(byId["rule-schoenheit"], "meets", "non-required, no finding => meets");
  assert.equal(byId["rule-mietobjekt"], "missing", "required, no finding => missing");
});
