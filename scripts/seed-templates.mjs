// Seed the system-curated contract template(s) from the RAG corpus.
//
//   node scripts/seed-templates.mjs        # upsert the curated template(s)
//
// Needs DATABASE_URL in lexora/.env.local and the columns from
// db/007_contract_templates.sql. MUST run AFTER `npm run seed:library` — the
// template's `sections` point at the curated §-clauses by their clause_library
// id, and this script hard-errors if a lookup misses.
//
// Curated templates have user_id = NULL and are keyed by `doc_ref`, so
// re-running is an upsert, not a duplicate.

import { parseTemplateClauses } from "../src/lib/library/parse-corpus.ts";
import { topicForParagraph, topicLabel } from "../src/lib/clause-taxonomy.ts";
import { ragQuery, endRagPool } from "../src/lib/rag/db.ts";

const DOC_REF = "22-vorlage";
const NAME = "Standard-Wohnraummietvertrag (Deutschland)";
// Must match src/components/create-contract-modal.tsx CONTRACT_TYPES exactly —
// this string routes to the grounded RAG path in src/app/api/generate/route.ts.
const CONTRACT_TYPE = "Lease Agreement";

// Bracketed corpus placeholders → {{variables}}. Applied per §-clause; the two
// `[Betrag]` in § 3 are positional (Nettokaltmiete first, Betriebskosten second).
function rewritePlaceholders(para, content) {
  let out = content
    .replace("[Adresse, Etage, Lage]", "{{propertyAddress}}")
    .replace("[Zahl] Zimmern", "{{rooms}} Zimmern")
    .replace("[m²]", "{{areaSqm}}")
    .replace("[Nebenräume]", "{{nebenraeume}}")
    .replace("[Keller, Stellplatz, Gartenanteil]", "{{extras}}")
    .replace("[Zahl] Schlüssel", "{{keys}} Schlüssel")
    .replace("[Datum]", "{{startDate}}")
    .replace("[Summe]", "{{totalRentEur}}")
    .replace("[IBAN]", "{{iban}}")
    .replace("[max. drei Nettokaltmieten]", "{{depositEur}}");

  if (para === 3) {
    out = out
      .replace("[Betrag]", "{{baseRentEur}}") // Nettokaltmiete
      .replace("[Betrag]", "{{operatingCostsEur}}"); // Betriebskostenvorauszahlung
  }

  const leftover = out.match(/\[[^\]]+\]/);
  if (leftover) {
    throw new Error(
      `seed-templates: unmapped placeholder ${leftover[0]} left in § ${para} — ` +
        `add it to rewritePlaceholders() and to VARIABLES`,
    );
  }
  return out;
}

const REQUIRED_SECTIONS = new Set([1, 2, 3]); // Mietobjekt, Mietzeit, Miete

const VARIABLES = [
  // Bound to the create-contract-modal's existing fields via `maps_to`.
  { key: "party1", label: "Vermieter (Landlord)", type: "text", required: true, maps_to: "landlord", group: "Parteien" },
  { key: "party2", label: "Mieter (Tenant)", type: "text", required: true, maps_to: "tenant", group: "Parteien" },
  { key: "propertyAddress", label: "Anschrift der Wohnung", type: "text", required: true, maps_to: "propertyAddress", group: "Mietobjekt" },
  { key: "baseRentEur", label: "Nettokaltmiete (EUR/Monat)", type: "currency", required: true, maps_to: "baseRentEur", group: "Miete" },
  { key: "operatingCostsEur", label: "Betriebskostenvorauszahlung (EUR/Monat)", type: "currency", maps_to: "operatingCostsEur", group: "Miete" },
  { key: "depositEur", label: "Kaution (EUR)", type: "currency", maps_to: "depositEur", group: "Miete" },
  // New fields (no modal binding yet).
  { key: "startDate", label: "Mietbeginn", type: "date", required: true, group: "Mietzeit" },
  { key: "rooms", label: "Zimmerzahl", type: "number", group: "Mietobjekt" },
  { key: "areaSqm", label: "Wohnfläche (m²)", type: "number", group: "Mietobjekt" },
  { key: "iban", label: "IBAN für Mietzahlungen", type: "text", group: "Miete" },
  { key: "extras", label: "Mitvermietet (Keller, Stellplatz, Gartenanteil)", type: "text", group: "Mietobjekt" },
  { key: "keys", label: "Übergebene Schlüssel", type: "number", group: "Mietobjekt" },
  { key: "nebenraeume", label: "Nebenräume", type: "text", group: "Mietobjekt" },
  // Derived — evaluated by src/lib/templates/render.ts (no eval).
  { key: "totalRentEur", label: "Gesamtmiete (EUR/Monat)", type: "derived", expr: "baseRentEur + operatingCostsEur", group: "Miete" },
];

/** Build the authoritative body + the structured section index. */
async function buildTemplate() {
  const clauses = parseTemplateClauses(); // 11 §-clauses, cleaned text
  const bodyParts = [];
  const sections = [];

  for (const c of clauses) {
    const m = c.doc_ref.match(/#p(\d+)$/);
    if (!m) throw new Error(`seed-templates: bad doc_ref ${c.doc_ref}`);
    const para = Number(m[1]);

    const topic = topicForParagraph(para);
    if (!topic) throw new Error(`seed-templates: § ${para} has no topic mapping`);

    const clauseRow = await ragQuery(
      `select id from clause_library where doc_ref = $1 and source = 'curated' and deleted_at is null`,
      [`${DOC_REF}#p${para}`],
    );
    if (!clauseRow[0]?.id) {
      throw new Error(
        `seed-templates: no curated clause_library row for ${DOC_REF}#p${para} — ` +
          `run "npm run seed:library" first`,
      );
    }

    const text = rewritePlaceholders(para, c.content);
    bodyParts.push(`### ${c.title}\n\n${text}`);
    sections.push({
      key: topic,
      heading: c.title,
      clause_type: topic,
      clause_id: clauseRow[0].id,
      required: REQUIRED_SECTIONS.has(para),
    });
  }

  const body = bodyParts.join("\n\n");
  return { body, sections };
}

async function upsert() {
  const { body, sections } = await buildTemplate();

  const res = await ragQuery(
    `insert into contract_templates
       (user_id, name, name_en, description, contract_type, language,
        body, sections, variables, source, doc_ref, is_approved, tags)
     values (null, $1, $2, $3, $4, 'de', $5, $6::jsonb, $7::jsonb, 'curated', $8, false, $9)
     on conflict (doc_ref) where source = 'curated'
     do update set
       name          = excluded.name,
       name_en       = excluded.name_en,
       description    = excluded.description,
       contract_type  = excluded.contract_type,
       body          = excluded.body,
       sections      = excluded.sections,
       variables     = excluded.variables,
       tags          = excluded.tags,
       updated_at    = now()
     returning (xmax = 0) as was_insert`,
    [
      NAME,
      "Standard residential lease (Germany)",
      "BGH-konforme Standardklauseln (§§ 1–11) aus der kuratierten RAG-Vorlage. " +
        "Beträge, Daten und Parteien werden aus den Platzhaltern eingesetzt; " +
        "informatorisches Werkzeug, keine Rechtsberatung (RDG).",
      CONTRACT_TYPE,
      body,
      JSON.stringify(sections),
      JSON.stringify(VARIABLES),
      DOC_REF,
      ["vorlage", "wohnraummietvertrag", "muster", "lease"],
    ],
  );

  return { was_insert: !!res[0]?.was_insert, sectionCount: sections.length, bodyChars: body.length };
}

try {
  const t0 = Date.now();
  const r = await upsert();
  console.log(`\n  contract_templates — curated seed`);
  console.log(`  template         ${NAME}`);
  console.log(`  doc_ref          ${DOC_REF}`);
  console.log(`  contract_type    ${CONTRACT_TYPE}`);
  console.log(`  ${r.was_insert ? "inserted" : "updated  "}         1`);
  console.log(`  sections         ${r.sectionCount}  (${VARIABLES.length} variables)`);
  console.log(`  body             ${r.bodyChars} chars`);
  console.log(`  topics           ${[...new Set([1, 2, 3, 4, 5].map((p) => topicLabel(topicForParagraph(p))))].join(", ")}, …`);
  console.log(`  elapsed          ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
} finally {
  await endRagPool();
}
