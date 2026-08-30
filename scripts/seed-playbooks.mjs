// Seed the ONE system-curated playbook: the standard German residential-lease
// review positions ("Deutscher Wohnraummietvertrag — Standardpositionen").
//
//   node scripts/seed-playbooks.mjs        # upsert the playbook + replace its rules
//
// Needs DATABASE_URL in lexora/.env.local, the columns from db/008_playbooks.sql,
// and a seeded clause_library (run `npm run seed:library` FIRST — the rules
// point preferred_clause_id at curated library rows by doc_ref).
//
// The playbook is keyed by doc_ref = 'de-wohnraum-standard'; re-running upserts
// the playbook and does a delete-then-insert of its rules inside a transaction,
// so it is idempotent. Every row ships is_approved = false (RDG): only a human
// toggles "lawyer-reviewed".
//
// The acceptable / fallback / unacceptable split is legal judgement, not a
// regex — so the rules are hand-authored here, derived from the RAG corpus
// (src/lib/rag/corpus/*.md), in particular 23-mietvertrag-checkliste.md:
//   "Zwingend erforderlich"        -> is_required = true,  severity = 'high'
//   "Dringend empfohlen"           -> is_required = false, severity = 'medium'
//   "Unzulässig — nicht aufnehmen" -> the matching rule's `unacceptable`

import { ragPool, endRagPool } from "../src/lib/rag/db.ts";

const DOC_REF = "de-wohnraum-standard";

const PLAYBOOK = {
  name: "Deutscher Wohnraummietvertrag — Standardpositionen",
  description:
    "Standard-Prüfmaßstab für Wohnraummietverträge nach BGB und BGH-Rechtsprechung. " +
    "Kodifiziert die Positionen, die src/lib/analysis.ts sonst fest verdrahtet.",
  contract_type: "Lease Agreement",
  language: "de",
};

// preferred_clause_id is resolved from clause_library by this doc_ref (null = none).
const RULES = [
  {
    clause_type: "mietobjekt",
    topic: "Mietobjekt",
    severity: "high",
    is_required: true,
    preferred_doc_ref: "22-vorlage#p1",
    acceptable:
      "Wohnung genau bezeichnet: Anschrift, Lage im Haus, Zahl und Art der Räume, " +
      "mitvermietete Flächen (Keller, Stellplatz, Garten) und Zahl der übergebenen Schlüssel.",
    fallback:
      "Bezeichnung über eine beigefügte Wohnungsskizze/Grundriss, auf die der Vertrag verweist.",
    unacceptable:
      "Mietobjekt fehlt, ist nur unbestimmt bezeichnet, oder Flächen-/Schlüsselangaben " +
      "fehlen vollständig. Platzhalter wie „[EINFÜGEN]“ im finalen Vertrag.",
    rationale:
      "Ohne bestimmte Leistungspflicht ist der Vertrag unvollständig; die Wohnung muss " +
      "identifizierbar sein.",
    reference: "§ 535 BGB",
  },
  {
    clause_type: "mietzeit",
    topic: "Befristung",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "18-zeitmietvertrag-575",
    acceptable:
      "Unbefristetes Mietverhältnis. Eine Befristung nur mit im Vertrag genanntem " +
      "qualifiziertem Grund nach § 575 Abs. 1 BGB (Eigenbedarf, Abriss/Umbau, " +
      "Betriebsbedarf).",
    fallback:
      "Kündigungsverzicht beider Seiten für höchstens vier Jahre ab Vertragsschluss.",
    unacceptable:
      "Zeitmietvertrag ohne Angabe des Befristungsgrundes; einseitiger Kündigungsverzicht " +
      "zulasten des Mieters; Kündigungsverzicht über vier Jahre.",
    rationale:
      "Ein Zeitmietvertrag ohne qualifizierten Grund gilt als unbefristet (§ 575 Abs. 1 S. 2 BGB).",
    reference: "§ 575 BGB",
  },
  {
    clause_type: "miete",
    topic: "Miethöhe und Fälligkeit",
    severity: "high",
    is_required: true,
    preferred_doc_ref: "22-vorlage#p3",
    acceptable:
      "Nettokaltmiete als bezifferter Betrag; Betriebskosten getrennt ausgewiesen. " +
      "Fälligkeit spätestens am dritten Werktag des Monats, Zahlungsweg benannt.",
    fallback:
      "Inklusivmiete (Teilinklusivmiete) mit klar bezifferter Nettokaltmiete und " +
      "gesondert ausgewiesenem Betriebskostenanteil.",
    unacceptable:
      "Nettokaltmiete nicht beziffert; Betriebskosten nicht getrennt ausgewiesen; " +
      "Fälligkeit vor dem dritten Werktag; Aufrechnungs-/Zurückbehaltungsverbot ohne " +
      "die Ausnahme für unbestrittene oder rechtskräftig festgestellte Forderungen.",
    rationale:
      "Die Hauptleistungspflicht muss bestimmt sein; § 556b Abs. 1 BGB legt die Fälligkeit fest.",
    reference: "§ 556b Abs. 1 BGB",
  },
  {
    clause_type: "betriebskosten",
    topic: "Betriebskosten",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "04-betriebskosten-556-betrkv",
    acceptable:
      "Umlage nur der in § 2 BetrKV genannten Betriebskosten, ausdrücklich in Bezug " +
      "genommen; Vorauszahlungen in angemessener Höhe; jährliche Abrechnung binnen " +
      "zwölf Monaten nach Ende des Abrechnungszeitraums.",
    fallback:
      "Betriebskostenpauschale, sofern gesondert ausgewiesen und nicht die Nettokaltmiete verdeckend.",
    unacceptable:
      "„Sonstige Betriebskosten“ ohne konkrete Benennung; Umlage von Verwaltungs- oder " +
      "Instandhaltungskosten; Abrechnungsfrist zulasten des Mieters verkürzt oder " +
      "Einwendungsfrist unter zwölf Monaten.",
    rationale:
      "Nur konkret vereinbarte Betriebskosten i. S. d. BetrKV sind umlagefähig; " +
      "§ 556 Abs. 3 BGB setzt die Abrechnungsfrist.",
    reference: "§ 556 BGB, § 2 BetrKV",
  },
  {
    clause_type: "kaution",
    topic: "Kaution",
    severity: "high",
    is_required: false,
    preferred_doc_ref: "03-kaution-551",
    acceptable:
      "Höchstens drei Nettokaltmieten; Recht des Mieters auf Zahlung in drei gleichen " +
      "Monatsraten (erste Rate zu Mietbeginn); getrennte, insolvenzfeste Anlage, Zinsen " +
      "stehen dem Mieter zu.",
    fallback:
      "Zwei Nettokaltmieten oder eine gleichwertige Bürgschaft statt Barkaution.",
    unacceptable:
      "Kaution über drei Nettokaltmieten; volle Kaution fällig vor Übergabe; " +
      "Ausschluss der Ratenzahlung; keine getrennte Anlage; Verzinsung zugunsten des Vermieters.",
    rationale:
      "§ 551 BGB begrenzt Höhe, Fälligkeit und Anlage der Mietsicherheit; abweichende " +
      "Vereinbarungen zulasten des Mieters sind unwirksam (§ 551 Abs. 4 BGB).",
    reference: "§ 551 BGB",
  },
  {
    clause_type: "schoenheitsreparaturen",
    topic: "Schönheitsreparaturen",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "10-schoenheitsreparaturen",
    acceptable:
      "Übertragung auf den Mieter nur bei renoviert übergebener Wohnung (oder mit " +
      "angemessenem Ausgleich), mit weichem Fristenplan als Richtwert („in der Regel“) " +
      "abhängig vom tatsächlichen Erhaltungszustand.",
    fallback:
      "Übertragung ohne Fristenplan, Renovierung nur nach tatsächlichem Bedarf.",
    unacceptable:
      "Starre Fristenpläne; Übertragung bei unrenoviert übergebener Wohnung ohne " +
      "Ausgleich; Endrenovierungsklausel unabhängig vom Zustand; Quotenabgeltungsklausel; " +
      "Vorgaben zur Ausführungsart während der Mietzeit.",
    rationale:
      "Schönheitsreparaturen sind gesetzlich Vermietersache (§ 535 Abs. 1 S. 2 BGB); " +
      "eine unwirksame Formularklausel führt ersatzlos zum Gesetz (BGH VIII ZR 185/14).",
    reference: "§§ 307–309 BGB, § 535 Abs. 1 S. 2 BGB",
  },
  {
    clause_type: "kleinreparaturen",
    topic: "Kleinreparaturen",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "11-kleinreparaturen",
    acceptable:
      "Beteiligung des Mieters nur an Bagatellschäden an Gegenständen seines häufigen " +
      "Zugriffs, mit Einzelobergrenze (etwa 100–120 €) und Jahresobergrenze (etwa 6–8 % " +
      "der Jahresnettokaltmiete).",
    fallback:
      "Einzelobergrenze bis 150 € bei gleichzeitiger Jahresobergrenze.",
    unacceptable:
      "Kleinreparaturklausel ohne Einzel- oder Jahresobergrenze; anteilige Beteiligung " +
      "des Mieters an Reparaturen oberhalb der Grenze; Erstreckung auf nicht dem " +
      "Zugriff des Mieters unterliegende Teile.",
    rationale:
      "Ohne betragsmäßige Deckelung benachteiligt die Klausel den Mieter unangemessen " +
      "(§ 307 BGB); die Instandhaltungslast trägt sonst der Vermieter (§ 535 BGB).",
    reference: "§ 307 BGB, § 535 BGB",
  },
  {
    clause_type: "instandhaltung",
    topic: "Mietminderung und Mängelrechte",
    severity: "high",
    is_required: false,
    preferred_doc_ref: "02-mietmangel-minderung-536",
    acceptable:
      "Mängelrechte des Mieters (Minderung, Aufwendungsersatz, außerordentliche " +
      "Kündigung) bleiben unangetastet; Mängelanzeigepflicht des Mieters ist zulässig.",
    fallback:
      "Verpflichtung, die geminderte Miete unter Vorbehalt zu zahlen und den Mangel " +
      "unverzüglich schriftlich anzuzeigen.",
    unacceptable:
      "Ausschluss oder Erschwerung der Mietminderung; Beschränkung auf vom Vermieter " +
      "verschuldete Mängel; Aufrechnungsverbot gegen Minderungsansprüche.",
    rationale:
      "Bei Wohnraum ist eine zum Nachteil des Mieters von § 536 BGB abweichende " +
      "Vereinbarung unwirksam (§ 536 Abs. 4 BGB).",
    reference: "§ 536 BGB, § 536 Abs. 4 BGB",
  },
  {
    clause_type: "nutzung",
    topic: "Tierhaltung",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "17-tierhaltung",
    acceptable:
      "Kleintierhaltung (Ziervögel, Zierfische, Hamster u. Ä.) ist erlaubnisfrei " +
      "gestattet; Hunde und Katzen bedürfen der Zustimmung des Vermieters, die nur aus " +
      "sachlichem Grund verweigert werden darf (Interessenabwägung).",
    fallback:
      "Hunde-/Katzenhaltung unter Widerrufsvorbehalt für den Fall konkreter Störungen.",
    unacceptable:
      "Generelles, ausnahmsloses Tierhaltungsverbot; Verbot auch der Kleintierhaltung; " +
      "Zustimmung „im freien Ermessen“ des Vermieters.",
    rationale:
      "Ein generelles Tierhaltungsverbot benachteiligt den Mieter unangemessen und ist " +
      "unwirksam (BGH VIII ZR 168/12); es entscheidet die Abwägung im Einzelfall.",
    reference: "§ 307 BGB, §§ 535, 541 BGB",
  },
  {
    clause_type: "nutzung",
    topic: "Untervermietung",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "16-untervermietung-540-553",
    acceptable:
      "Untervermietung mit Erlaubnis des Vermieters; bei berechtigtem Interesse des " +
      "Mieters (§ 553 BGB) besteht ein Anspruch auf Gestattung eines Teils der Wohnung, " +
      "sofern kein wichtiger Grund in der Person des Dritten entgegensteht.",
    fallback:
      "Erlaubnis mit angemessenem Untermietzuschlag, soweit die Überlassung dem " +
      "Vermieter nur bei Zuschlag zumutbar ist.",
    unacceptable:
      "Generelles Untervermietungsverbot ohne § 553-Vorbehalt; Erlaubnis ausschließlich " +
      "im freien Ermessen des Vermieters; Ausschluss des Sonderkündigungsrechts nach " +
      "§ 540 Abs. 1 S. 2 BGB.",
    rationale:
      "§ 553 BGB gibt dem Mieter unter Voraussetzungen einen Anspruch auf " +
      "Untervermietungserlaubnis; abweichende Klauseln zu seinem Nachteil sind unwirksam.",
    reference: "§§ 540, 553 BGB",
  },
  {
    clause_type: "kuendigung",
    topic: "Ordentliche Kündigung durch den Vermieter",
    severity: "high",
    is_required: false,
    preferred_doc_ref: "12-ordentliche-kuendigung-vermieter-573",
    acceptable:
      "Ordentliche Kündigung durch den Vermieter nur bei berechtigtem Interesse " +
      "(§ 573 BGB), im Kündigungsschreiben begründet; Verweis auf das gesetzliche " +
      "Widerspruchsrecht des Mieters (§§ 574 ff. BGB).",
    fallback:
      "Klarstellung, dass eine Kündigung zum Zweck der Mieterhöhung ausgeschlossen ist " +
      "(§ 573 Abs. 1 S. 2 BGB).",
    unacceptable:
      "Erleichterte oder grundlose Kündigungsmöglichkeit des Vermieters; Verzicht des " +
      "Mieters auf den Kündigungswiderspruch; Kündigung zur Mieterhöhung.",
    rationale:
      "Der Wohnraummieter ist durch das Erfordernis des berechtigten Interesses " +
      "geschützt; abweichende Vereinbarungen zu seinem Nachteil sind unwirksam (§ 573 Abs. 4 BGB).",
    reference: "§ 573 BGB",
  },
  {
    clause_type: "kuendigung",
    topic: "Kündigungsfristen",
    severity: "high",
    is_required: false,
    preferred_doc_ref: "13-kuendigungsfristen-573c",
    acceptable:
      "Für den Mieter durchgehend drei Monate Kündigungsfrist; für den Vermieter die " +
      "gestaffelte gesetzliche Frist (3 / 6 / 9 Monate nach 0 / 5 / 8 Jahren).",
    fallback:
      "Beiderseits die gesetzlichen Fristen des § 573c BGB, ohne Staffelung zulasten des Mieters.",
    unacceptable:
      "Für den Mieter längere Kündigungsfrist als drei Monate; verlängerte Fristen auch " +
      "für den Vermieter zulasten des Mieters; formularmäßiger Kündigungsausschluss über vier Jahre.",
    rationale:
      "Eine von § 573c Abs. 1 BGB zum Nachteil des Mieters abweichende Vereinbarung ist " +
      "unwirksam (§ 573c Abs. 4 BGB).",
    reference: "§ 573c BGB",
  },
  {
    clause_type: "miete",
    topic: "Mieterhöhung",
    severity: "medium",
    is_required: false,
    preferred_doc_ref: "05-mieterhoehung-vergleichsmiete-558",
    acceptable:
      "Mieterhöhung bis zur ortsüblichen Vergleichsmiete nach § 558 BGB, unter Beachtung " +
      "der Jahressperrfrist und der Kappungsgrenze (20 %, in angespannten Märkten 15 % " +
      "in drei Jahren), mit Begründung durch Mietspiegel/Gutachten.",
    fallback:
      "Staffelmiete (§ 557a BGB) oder Indexmiete (§ 557b BGB) mit klar bezifferten " +
      "Schritten bzw. Bezugsindex.",
    unacceptable:
      "Einseitiges Mieterhöhungsrecht des Vermieters ohne gesetzliche Grundlage; " +
      "Umgehung von Sperrfrist oder Kappungsgrenze; Staffel- und Indexmiete kombiniert.",
    rationale:
      "Außerhalb von §§ 557a, 557b BGB kann die Miete nur im Verfahren des § 558 BGB " +
      "einseitig erhöht werden; abweichende Klauseln zulasten des Mieters sind unwirksam.",
    reference: "§ 558 BGB, §§ 557a, 557b BGB",
  },
  {
    clause_type: "sonstiges",
    topic: "Vertragsstrafen und pauschaler Schadensersatz",
    severity: "high",
    is_required: false,
    preferred_doc_ref: null,
    acceptable:
      "Keine Vertragsstrafen und keine pauschalierten Schadensersatzbeträge zulasten " +
      "des Mieters. Schadensersatz richtet sich nach dem konkret nachgewiesenen Schaden.",
    fallback:
      "Pauschalierter Schadensersatz nur, wenn er den gewöhnlichen Schaden nicht " +
      "übersteigt und dem Mieter der Nachweis eines geringeren Schadens ausdrücklich " +
      "offensteht (§ 309 Nr. 5 BGB).",
    unacceptable:
      "Jede formularmäßige Vertragsstrafe zulasten des Mieters; pauschaler " +
      "Schadensersatz ohne Gegenbeweisvorbehalt oder über dem gewöhnlichen Schaden.",
    rationale:
      "Formularmäßige Vertragsstrafen im Wohnraummietrecht sind nach § 555 BGB " +
      "unwirksam; Schadensersatzpauschalen unterliegen § 309 Nr. 5 BGB.",
    reference: "§ 555 BGB, § 309 Nr. 5 BGB",
  },
  {
    clause_type: "schlussbestimmungen",
    topic: "Schlussbestimmungen",
    severity: "low",
    is_required: false,
    preferred_doc_ref: "22-vorlage#p11",
    acceptable:
      "Salvatorische Klausel mit Rückfall auf das Gesetz; Änderungen und Ergänzungen " +
      "in Textform; als Anlagen benannt: Übergabeprotokoll, Betriebskostenaufstellung, " +
      "Hausordnung.",
    fallback:
      "Schriftformklausel, sofern sie individuelle Abreden nicht entwertet " +
      "(§ 305b BGB — Vorrang der Individualabrede).",
    unacceptable:
      "Doppelte Schriftformklausel, die mündliche Individualabreden ausschließt; " +
      "Bestätigung des Mieters, keine Nebenabreden getroffen zu haben; Ausschluss der " +
      "gesetzlichen Regel bei Teilnichtigkeit.",
    rationale:
      "Individualabreden haben Vorrang vor AGB (§ 305b BGB); Klauseln, die dies " +
      "aushebeln, sind unwirksam.",
    reference: "§§ 305b, 307 BGB",
  },
];

async function resolvePreferredClauseIds(client) {
  const wanted = [...new Set(RULES.map((r) => r.preferred_doc_ref).filter(Boolean))];
  const { rows } = await client.query(
    `select id, doc_ref from clause_library where source = 'curated' and doc_ref = any($1)`,
    [wanted],
  );
  const byRef = new Map(rows.map((r) => [r.doc_ref, r.id]));
  const missing = wanted.filter((ref) => !byRef.has(ref));
  if (missing.length) {
    throw new Error(
      `clause_library is missing curated rows for: ${missing.join(", ")}. ` +
        `Run \`npm run seed:library\` before \`npm run seed:playbooks\`.`,
    );
  }
  return byRef;
}

async function run() {
  const client = await ragPool().connect();
  try {
    await client.query("begin");

    const byRef = await resolvePreferredClauseIds(client);

    const pbRes = await client.query(
      `insert into playbooks
         (user_id, name, description, contract_type, language, source, doc_ref, is_default, is_approved)
       values (null, $1, $2, $3, $4, 'curated', $5, false, false)
       on conflict (doc_ref) where source = 'curated'
       do update set
         name        = excluded.name,
         description = excluded.description,
         contract_type = excluded.contract_type,
         language    = excluded.language,
         updated_at  = now()
       returning id, (xmax = 0) as was_insert`,
      [PLAYBOOK.name, PLAYBOOK.description, PLAYBOOK.contract_type, PLAYBOOK.language, DOC_REF],
    );
    const playbookId = pbRes.rows[0].id;
    const wasInsert = pbRes.rows[0].was_insert;

    // Replace the rule set wholesale so re-running is clean.
    await client.query(`delete from playbook_rules where playbook_id = $1`, [playbookId]);

    for (let i = 0; i < RULES.length; i++) {
      const r = RULES[i];
      await client.query(
        `insert into playbook_rules
           (playbook_id, clause_type, topic, acceptable, fallback, unacceptable,
            rationale, reference, preferred_clause_id, severity, is_required, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          playbookId,
          r.clause_type,
          r.topic,
          r.acceptable,
          r.fallback ?? null,
          r.unacceptable,
          r.rationale ?? null,
          r.reference ?? null,
          r.preferred_doc_ref ? byRef.get(r.preferred_doc_ref) : null,
          r.severity,
          r.is_required,
          i,
        ],
      );
    }

    await client.query("commit");

    console.log(`\n  playbooks — curated seed`);
    console.log(`  playbook         ${PLAYBOOK.name}`);
    console.log(`  doc_ref          ${DOC_REF}`);
    console.log(`  action           ${wasInsert ? "inserted" : "updated"}`);
    console.log(`  rules            ${RULES.length} (replaced)`);
    console.log(`  required rules   ${RULES.filter((r) => r.is_required).length}`);
    console.log(`  with preferred   ${RULES.filter((r) => r.preferred_doc_ref).length}`);
    console.log(`  is_approved      false (RDG — a human toggles this)\n`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

try {
  const t0 = Date.now();
  await run();
  console.log(`  elapsed          ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
} finally {
  await endRagPool();
}
