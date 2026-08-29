// ─────────────────────────────────────────────────────────────────────────────
//  RAG eval agent — German rental contracts
//
//   node scripts/rag-eval.mjs                # retrieval + generation eval
//   node scripts/rag-eval.mjs --no-generate  # retrieval only (no draft calls)
//   node scripts/rag-eval.mjs --rebuild      # rebuild the vector index first
//
//  Reads GEMINI_API_KEY from lexora/.env.local. Builds the local vector store
//  at data/rag/de-rental-index.json if it is missing. Prints a scored report and
//  exits non-zero when a threshold is missed — so it can gate CI or a pre-merge
//  check on this branch.
// ─────────────────────────────────────────────────────────────────────────────

import { loadEnvLocal } from "../src/lib/rag/load-env.ts";
import { QuotaExhaustedError } from "../src/lib/rag/gemini.ts";
import { buildIndex } from "../src/lib/rag/ingest.ts";
import { indexMeta } from "../src/lib/rag/store.ts";
import { endRagPool } from "../src/lib/rag/db.ts";
import { retrieve } from "../src/lib/rag/retrieve.ts";
import { generateGermanRentalContract } from "../src/lib/rag/generate.ts";

const args = new Set(process.argv.slice(2));
const RUN_GENERATION = !args.has("--no-generate");
const FORCE_REBUILD = args.has("--rebuild");

const TOP_K = 5;

// Retrieval expectations: each query should surface at least one `expectDocs`
// entry inside the top-K. Doc ids match src/lib/rag/corpus/*.md basenames.
const RETRIEVAL_CASES = [
  { q: "Wie hoch darf die Mietkaution sein und in wie vielen Raten ist sie zahlbar?", expectDocs: ["03-kaution-551"] },
  { q: "Bis wann muss der Vermieter die Betriebskostenabrechnung zustellen?", expectDocs: ["04-betriebskosten-556-betrkv"] },
  { q: "Sind starre Fristen für Schönheitsreparaturen im Formularvertrag wirksam?", expectDocs: ["10-schoenheitsreparaturen"] },
  { q: "Welche Kündigungsfrist hat der Vermieter nach mehr als acht Jahren Mietdauer?", expectDocs: ["13-kuendigungsfristen-573c"] },
  { q: "Was besagt die Mietpreisbremse und welche Ausnahmen gibt es?", expectDocs: ["06-mietpreisbremse-556d"] },
  { q: "Darf der Vermieter ein generelles Hunde- und Katzenverbot vereinbaren?", expectDocs: ["17-tierhaltung"] },
  { q: "Unter welchen Voraussetzungen kann der Vermieter wegen Eigenbedarf kündigen?", expectDocs: ["15-eigenbedarf-573-2-2", "12-ordentliche-kuendigung-vermieter-573"] },
  { q: "Welcher Höchstbetrag gilt bei Kleinreparaturen je Einzelfall?", expectDocs: ["11-kleinreparaturen"] },
  { q: "Wie hoch ist die Kappungsgrenze bei der Erhöhung auf die ortsübliche Vergleichsmiete?", expectDocs: ["05-mieterhoehung-vergleichsmiete-558"] },
  { q: "Ab wann darf der Vermieter wegen Zahlungsverzug fristlos kündigen?", expectDocs: ["14-fristlose-kuendigung-543-569"] },
  { q: "Hat der Mieter einen Anspruch darauf, ein Zimmer unterzuvermieten?", expectDocs: ["16-untervermietung-540-553"] },
  { q: "Kann ein Wohnraummietvertrag wirksam befristet werden?", expectDocs: ["18-zeitmietvertrag-575"] },
  { q: "Wie lange muss eine Mietstaffel bei der Staffelmiete mindestens laufen?", expectDocs: ["07-staffelmiete-557a"] },
  { q: "Welche Kündigungssperrfrist gilt nach Umwandlung in eine Eigentumswohnung?", expectDocs: ["20-umwandlung-577-577a"] },
];

// Generation expectations: patterns the draft must / must not contain.
const GENERATION_CASES = [
  {
    name: "Berlin flat, deposit within the §551 cap, pet clause requested",
    params: {
      landlord: "Anna Vermieterin",
      tenant: "Ben Mieter",
      propertyAddress: "Musterstraße 12, 3. OG rechts, 10115 Berlin",
      baseRentEur: 1200,
      operatingCostsEur: 250,
      depositEur: 3000,
      keyTerms: "Die Haltung eines kleinen Hundes soll ausdrücklich erlaubt sein. Mietbeginn 1. März 2026.",
    },
    mustInclude: [
      /§\s?551/,          // Kaution grounded
      /§\s?556/,          // Betriebskosten grounded
      /§\s?573c/,         // Kündigungsfristen grounded
      /nettokaltmiete/i,
      /1[.\s]?200/,       // the cold rent shows up
      /kaution/i,
      /hund/i,            // the requested pet term made it in
    ],
    mustNotInclude: [
      /\[[^\]\n]{0,40}(einfügen|insert|tbd|xxx|platzhalter)[^\]\n]{0,40}\]/i,
      /kaution[^.\n]{0,60}(vier|fünf|sechs|4|5|6)\s*(nettokaltmieten|monatsmieten|monatsmiete)/i,
    ],
  },
  {
    name: "Deposit omitted → model must apply the statutory maximum",
    params: {
      landlord: "Clara Eigentümer",
      tenant: "David Nguyen",
      propertyAddress: "Lindenweg 4, EG, 04109 Leipzig",
      baseRentEur: 900,
      operatingCostsEur: 180,
      keyTerms: "Unbefristetes Mietverhältnis. Eine spätere Mieterhöhung bis zur ortsüblichen Vergleichsmiete soll möglich sein.",
    },
    mustInclude: [
      /§\s?551/,
      /§\s?558/,                          // Vergleichsmiete, since it was requested
      /900/,
      /unbefristet|auf unbestimmte zeit/i, // either phrasing is correct
      /kaution/i,
    ],
    mustNotInclude: [
      /\[[^\]\n]{0,40}(einfügen|insert|tbd|xxx|platzhalter)[^\]\n]{0,40}\]/i,
      /kaution[^.\n]{0,60}(vier|fünf|sechs|4|5|6)\s*(nettokaltmieten|monatsmieten|monatsmiete)/i,
    ],
  },
];

// Thresholds — miss any and the process exits 1.
const THRESHOLDS = { hitAtK: 0.9, mrr: 0.75 };

const bar = "─".repeat(72);
const pct = (n) => `${(n * 100).toFixed(0)}%`;

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "\n  GEMINI_API_KEY is not set.\n" +
        "  Add it to lexora/.env.local (same key src/lib/llm.ts uses) and retry.\n",
    );
    process.exit(2);
  }

  // ── index ────────────────────────────────────────────────────────────────
  let meta;
  try {
    meta = await indexMeta();
  } catch (err) {
    if (/rag_chunks|rag_index_meta/.test(String(err))) {
      console.error(
        '\n  The RAG tables do not exist yet. Run:\n' +
          '    psql "$DATABASE_URL" -f db/005_rag_corpus.sql\n',
      );
      process.exit(2);
    }
    throw err;
  }

  if (FORCE_REBUILD || !meta) {
    process.stdout.write(
      FORCE_REBUILD ? "  rebuilding vector index … " : "  no index found — building … ",
    );
    const r = await buildIndex();
    console.log(`done (${r.chunkCount} chunks from ${r.docCount} docs, ${r.dim}-d)`);
    meta = await indexMeta();
  }

  console.log(`\n${bar}\n  RAG eval — German rental contracts`);
  console.log(`  index: ${meta.chunkCount} chunks · model ${meta.model} · built ${meta.builtAt}`);
  console.log(bar);

  // ── retrieval ────────────────────────────────────────────────────────────
  console.log(`\n  RETRIEVAL  (top-${TOP_K})\n`);
  let hitSum = 0;
  let rrSum = 0;
  let recallSum = 0;
  const retrievalFailures = [];

  for (const c of RETRIEVAL_CASES) {
    const hits = await retrieve(c.q, { topK: TOP_K });
    const ids = hits.map((h) => h.chunk.docId);
    const firstRank = ids.findIndex((id) => c.expectDocs.includes(id));
    const hit = firstRank !== -1;
    const rr = hit ? 1 / (firstRank + 1) : 0;
    const found = c.expectDocs.filter((d) => ids.includes(d)).length;
    const recall = found / c.expectDocs.length;

    hitSum += hit ? 1 : 0;
    rrSum += rr;
    recallSum += recall;

    const mark = hit ? "✓" : "✗";
    const top = hits[0] ? `${hits[0].chunk.docId} (${hits[0].score.toFixed(3)})` : "—";
    console.log(`  ${mark}  ${c.q}`);
    console.log(`      want ${c.expectDocs.join(" | ")}   got #1 ${top}`);
    if (!hit) {
      console.log(`      top-${TOP_K}: ${ids.join(", ")}`);
      retrievalFailures.push(c.q);
    }
  }

  const n = RETRIEVAL_CASES.length;
  const hitAtK = hitSum / n;
  const mrr = rrSum / n;
  const recall = recallSum / n;
  console.log(
    `\n  hit@${TOP_K} ${pct(hitAtK)}   MRR ${mrr.toFixed(3)}   recall ${pct(recall)}   (${hitSum}/${n} cases)`,
  );

  // ── generation ───────────────────────────────────────────────────────────
  const genFailures = [];
  if (RUN_GENERATION) {
    console.log(`\n${bar}\n  GENERATION  (grounded Wohnraummietvertrag)\n`);
    for (const c of GENERATION_CASES) {
      process.stdout.write(`  … ${c.name}\n`);
      const { contract, groundingRefs, context } = await generateGermanRentalContract(c.params);

      const missing = c.mustInclude.filter((re) => !re.test(contract));
      const forbidden = c.mustNotInclude.filter((re) => re.test(contract));
      const ok = missing.length === 0 && forbidden.length === 0;

      console.log(`      ${ok ? "✓ pass" : "✗ FAIL"}  ${contract.length} chars`);
      console.log(`      grounding refs: ${groundingRefs.slice(0, 8).join(", ") || "—"}`);
      console.log(`      retrieved: ${context.map((h) => h.chunk.docId).join(", ")}`);
      if (missing.length) console.log(`      missing:   ${missing.map(String).join("  ")}`);
      if (forbidden.length) console.log(`      forbidden: ${forbidden.map(String).join("  ")}`);
      if (!ok) genFailures.push(c.name);
    }
  } else {
    console.log(`\n  (generation eval skipped — --no-generate)`);
  }

  // ── verdict ──────────────────────────────────────────────────────────────
  console.log(`\n${bar}\n  RESULT`);
  const reasons = [];
  if (hitAtK < THRESHOLDS.hitAtK) reasons.push(`hit@${TOP_K} ${pct(hitAtK)} < ${pct(THRESHOLDS.hitAtK)}`);
  if (mrr < THRESHOLDS.mrr) reasons.push(`MRR ${mrr.toFixed(3)} < ${THRESHOLDS.mrr}`);
  if (genFailures.length) reasons.push(`generation failed: ${genFailures.join("; ")}`);
  if (retrievalFailures.length && hitAtK >= THRESHOLDS.hitAtK) {
    console.log(`  note: ${retrievalFailures.length} retrieval case(s) missed but above threshold`);
  }

  if (reasons.length) {
    console.log(`  ✗ FAIL — ${reasons.join(" · ")}\n${bar}\n`);
    await endRagPool();
    process.exit(1);
  }
  console.log(`  ✓ PASS — retrieval and generation within thresholds\n${bar}\n`);
}

main()
  .then(() => endRagPool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    await endRagPool().catch(() => {});
    if (err instanceof QuotaExhaustedError) {
      console.error(
        `\n  ⏳ ${err.message}\n` +
          `  This is an API-budget limit, not an eval failure. Wait a minute and re-run,\n` +
          `  or run \`node scripts/rag-ingest.mjs\` once (index is cached) then \`--no-generate\`.\n`,
      );
      process.exit(2);
    }
    console.error(`\n  eval crashed: ${err?.stack || err}\n`);
    process.exit(1);
  });
