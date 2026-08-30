// Data layer for playbooks (see db/008_playbooks.sql).
//
// A playbook is a named set of review POSITIONS (one rule per clause topic) —
// the structured, editable form of src/lib/analysis.ts reviewPrompt(). The
// clause library is the wording; a playbook is the acceptance criteria. The
// only coupling is playbook_rules.preferred_clause_id -> clause_library.id.
//
// Visibility: a signed-in user sees their own playbooks plus every
// system-curated one (user_id IS NULL). Writes go only to rows they own —
// curated playbooks are customised by cloning (clonePlaybook), never edited.

import { query, queryOne } from "@/lib/db";
import { isKnownTopic, topicLabel } from "@/lib/clause-taxonomy";
import type { PlaybookRule as PromptRule } from "@/lib/analysis";

const SEVERITIES = new Set(["high", "medium", "low"]);

export type Playbook = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  contract_type: string;
  language: string;
  source: "curated" | "user";
  doc_ref: string | null;
  is_default: boolean;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  rule_count?: number;
  /** true when this row is system-curated (not editable by the caller). */
  readonly?: boolean;
};

export type PlaybookRuleRow = {
  id: string;
  playbook_id: string;
  clause_type: string;
  topic: string;
  acceptable: string;
  fallback: string | null;
  unacceptable: string;
  rationale: string | null;
  reference: string | null;
  preferred_clause_id: string | null;
  severity: "high" | "medium" | "low";
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const P_COLS = `
  id, user_id, name, description, contract_type, language, source, doc_ref,
  is_default, is_approved, approved_by, approved_at, created_at, updated_at,
  (user_id is null) as readonly
`;

const R_COLS = `
  id, playbook_id, clause_type, topic, acceptable, fallback, unacceptable,
  rationale, reference, preferred_clause_id, severity, is_required, sort_order,
  created_at, updated_at
`;

// ── reads ───────────────────────────────────────────────────────────────────

/** Visible playbooks (own + curated), newest first. `contractType` also lets
 *  through the "any type" ('') playbooks. */
export async function listPlaybooks(
  userId: string,
  contractType?: string,
): Promise<Playbook[]> {
  const params: unknown[] = [userId];
  let typeFilter = "";
  if (contractType) {
    params.push(contractType);
    typeFilter = `and (p.contract_type = $2 or p.contract_type = '')`;
  }
  return query<Playbook>(
    `select ${P_COLS},
            (select count(*)::int from playbook_rules r where r.playbook_id = p.id) as rule_count
       from playbooks p
      where p.deleted_at is null
        and (p.user_id = $1 or p.user_id is null)
        ${typeFilter}
      order by p.is_default desc, p.source asc, p.updated_at desc`,
    params,
  );
}

/** One playbook the user may see (own or curated), or null. */
export async function getPlaybook(id: string, userId: string): Promise<Playbook | null> {
  return queryOne<Playbook>(
    `select ${P_COLS} from playbooks p
      where p.id = $1 and p.deleted_at is null
        and (p.user_id = $2 or p.user_id is null)`,
    [id, userId],
  );
}

export async function getRules(playbookId: string): Promise<PlaybookRuleRow[]> {
  return query<PlaybookRuleRow>(
    `select ${R_COLS} from playbook_rules
      where playbook_id = $1
      order by sort_order asc, created_at asc`,
    [playbookId],
  );
}

export type PlaybookWithRules = { playbook: Playbook; rules: PlaybookRuleRow[] };

/** Playbook + its rules (sort_order), visibility-checked. */
export async function getPlaybookWithRules(
  id: string,
  userId: string,
): Promise<PlaybookWithRules | null> {
  const playbook = await getPlaybook(id, userId);
  if (!playbook) return null;
  return { playbook, rules: await getRules(id) };
}

/** Shape a rule row for the analysis prompt (src/lib/analysis.ts PlaybookRule). */
export function toPromptRule(r: PlaybookRuleRow): PromptRule {
  return {
    id: r.id,
    clause_type: r.clause_type,
    topic: r.topic,
    acceptable: r.acceptable,
    fallback: r.fallback ?? undefined,
    unacceptable: r.unacceptable,
    rationale: r.rationale ?? undefined,
    reference: r.reference ?? undefined,
    severity: r.severity,
    is_required: r.is_required,
  };
}

/**
 * The playbook to analyse a contract against when the request names one
 * (visibility-checked) or, with `id` null/undefined, the user's default for
 * this contract type (an exact-type default beats an "any type" default).
 * Returns null when nothing applies.
 */
export async function resolvePlaybookForAnalysis(
  userId: string,
  contractType: string,
  id?: string | null,
): Promise<PlaybookWithRules | null> {
  if (id) return getPlaybookWithRules(id, userId);

  const row = await queryOne<{ id: string }>(
    `select id from playbooks
      where user_id = $1 and is_default and deleted_at is null
        and (contract_type = $2 or contract_type = '')
      order by (contract_type = $2) desc
      limit 1`,
    [userId, contractType ?? ""],
  );
  return row ? getPlaybookWithRules(row.id, userId) : null;
}

// ── writes (owner only; caller verifies ownership for [id] routes) ──────────

export type RuleInput = {
  clause_type: string;
  topic?: string;
  acceptable: string;
  fallback?: string | null;
  unacceptable: string;
  rationale?: string | null;
  reference?: string | null;
  preferred_clause_id?: string | null;
  severity?: "high" | "medium" | "low";
  is_required?: boolean;
  sort_order?: number;
};

export type CreateInput = {
  name: string;
  contract_type?: string;
  description?: string | null;
  language?: string;
  rules?: RuleInput[];
};

function cleanRule(input: RuleInput, fallbackOrder: number): Omit<PlaybookRuleRow,
  "id" | "playbook_id" | "created_at" | "updated_at"> {
  const clause_type = isKnownTopic(input.clause_type) ? input.clause_type : "sonstiges";
  const severity = input.severity && SEVERITIES.has(input.severity) ? input.severity : "medium";
  return {
    clause_type,
    topic: (input.topic && input.topic.trim()) || topicLabel(clause_type),
    acceptable: (input.acceptable ?? "").trim(),
    fallback: input.fallback?.trim() || null,
    unacceptable: (input.unacceptable ?? "").trim(),
    rationale: input.rationale?.trim() || null,
    reference: input.reference?.trim() || null,
    preferred_clause_id: input.preferred_clause_id || null,
    severity,
    is_required: !!input.is_required,
    sort_order: Number.isFinite(input.sort_order) ? Number(input.sort_order) : fallbackOrder,
  };
}

/** Create a user-owned playbook (+ optional rules). `is_approved` is false (RDG). */
export async function createPlaybook(userId: string, input: CreateInput): Promise<PlaybookWithRules> {
  const pb = await queryOne<Playbook>(
    `insert into playbooks (user_id, name, description, contract_type, language, source)
     values ($1, $2, $3, $4, $5, 'user')
     returning ${P_COLS}`,
    [
      userId,
      input.name.trim(),
      input.description?.trim() || null,
      (input.contract_type ?? "").trim(),
      input.language === "en" ? "en" : "de",
    ],
  );
  if (!pb) throw new Error("playbook insert returned nothing");

  const rules = input.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    await insertRule(pb.id, cleanRule(rules[i], i));
  }
  return { playbook: pb, rules: await getRules(pb.id) };
}

async function insertRule(
  playbookId: string,
  r: ReturnType<typeof cleanRule>,
): Promise<PlaybookRuleRow> {
  const row = await queryOne<PlaybookRuleRow>(
    `insert into playbook_rules
       (playbook_id, clause_type, topic, acceptable, fallback, unacceptable,
        rationale, reference, preferred_clause_id, severity, is_required, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning ${R_COLS}`,
    [
      playbookId, r.clause_type, r.topic, r.acceptable, r.fallback, r.unacceptable,
      r.rationale, r.reference, r.preferred_clause_id, r.severity, r.is_required, r.sort_order,
    ],
  );
  if (!row) throw new Error("rule insert returned nothing");
  return row;
}

export async function addRule(playbookId: string, input: RuleInput): Promise<PlaybookRuleRow> {
  const next = await queryOne<{ n: number }>(
    `select coalesce(max(sort_order) + 1, 0)::int as n from playbook_rules where playbook_id = $1`,
    [playbookId],
  );
  return insertRule(playbookId, cleanRule(input, next?.n ?? 0));
}

const RULE_EDITABLE = new Set([
  "clause_type", "topic", "acceptable", "fallback", "unacceptable",
  "rationale", "reference", "preferred_clause_id", "severity", "is_required", "sort_order",
]);

/** Patch a rule that belongs to `playbookId`. Caller has verified ownership. */
export async function updateRule(
  ruleId: string,
  playbookId: string,
  patch: Record<string, unknown>,
): Promise<PlaybookRuleRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  for (const [k, v] of Object.entries(patch)) {
    if (!RULE_EDITABLE.has(k)) continue;
    if (k === "clause_type" && typeof v === "string" && !isKnownTopic(v)) continue;
    if (k === "severity" && !(typeof v === "string" && SEVERITIES.has(v))) continue;
    if (k === "is_required") { add("is_required", !!v); continue; }
    if (k === "preferred_clause_id") { add("preferred_clause_id", v || null); continue; }
    if ((k === "fallback" || k === "rationale" || k === "reference") && typeof v === "string" && !v.trim()) {
      add(k, null);
      continue;
    }
    add(k, typeof v === "string" ? v.trim() : v);
  }
  if (sets.length === 0) {
    return queryOne<PlaybookRuleRow>(
      `select ${R_COLS} from playbook_rules where id = $1 and playbook_id = $2`,
      [ruleId, playbookId],
    );
  }
  params.push(ruleId, playbookId);
  return queryOne<PlaybookRuleRow>(
    `update playbook_rules set ${sets.join(", ")}
      where id = $${params.length - 1} and playbook_id = $${params.length}
      returning ${R_COLS}`,
    params,
  );
}

export async function deleteRule(ruleId: string, playbookId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `delete from playbook_rules where id = $1 and playbook_id = $2 returning id`,
    [ruleId, playbookId],
  );
  return row !== null;
}

const PB_EDITABLE = new Set(["name", "description", "is_default", "is_approved"]);

/**
 * Patch an owned playbook. Setting `is_approved` stamps `approved_by` /
 * `approved_at` (the RDG "a lawyer reviewed the positions" record). Setting
 * `is_default` clears any other default for the same (user_id, contract_type).
 */
export async function updatePlaybook(
  id: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<Playbook | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  for (const [k, v] of Object.entries(patch)) {
    if (!PB_EDITABLE.has(k)) continue;
    if (k === "name" && typeof v === "string" && v.trim()) { add("name", v.trim()); continue; }
    if (k === "description") { add("description", typeof v === "string" && v.trim() ? v.trim() : null); continue; }
    if (k === "is_default") { add("is_default", !!v); continue; }
    if (k === "is_approved") {
      add("is_approved", !!v);
      if (v) { add("approved_by", userId); sets.push(`approved_at = now()`); }
      else { sets.push(`approved_by = null`, `approved_at = null`); }
      continue;
    }
  }
  if (sets.length === 0) return getPlaybook(id, userId);

  // Clearing other defaults must happen before we set this one.
  if (patch.is_default === true) {
    await query(
      `update playbooks p set is_default = false
         from playbooks me
        where me.id = $1 and p.user_id = me.user_id
          and coalesce(p.contract_type,'') = coalesce(me.contract_type,'')
          and p.id <> me.id and p.is_default and p.deleted_at is null`,
      [id],
    );
  }

  params.push(id, userId);
  return queryOne<Playbook>(
    `update playbooks set ${sets.join(", ")}
      where id = $${params.length - 1} and user_id = $${params.length} and deleted_at is null
      returning ${P_COLS}`,
    params,
  );
}

export async function softDeletePlaybook(id: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update playbooks set deleted_at = now(), is_default = false
      where id = $1 and user_id = $2 and deleted_at is null
      returning id`,
    [id, userId],
  );
  return row !== null;
}

/**
 * Deep-copy a playbook the user can see (own or curated) into a fresh
 * user-owned playbook: source='user', doc_ref=null, is_default=false,
 * is_approved=false. This is how a user customises the curated playbook.
 */
export async function clonePlaybook(id: string, userId: string): Promise<PlaybookWithRules | null> {
  const src = await getPlaybookWithRules(id, userId);
  if (!src) return null;

  const pb = await queryOne<Playbook>(
    `insert into playbooks (user_id, name, description, contract_type, language, source)
     values ($1, $2, $3, $4, $5, 'user')
     returning ${P_COLS}`,
    [
      userId,
      `${src.playbook.name} (Kopie)`,
      src.playbook.description,
      src.playbook.contract_type,
      src.playbook.language,
    ],
  );
  if (!pb) throw new Error("playbook clone insert returned nothing");

  for (const r of src.rules) {
    await insertRule(pb.id, {
      clause_type: r.clause_type,
      topic: r.topic,
      acceptable: r.acceptable,
      fallback: r.fallback,
      unacceptable: r.unacceptable,
      rationale: r.rationale,
      reference: r.reference,
      preferred_clause_id: r.preferred_clause_id,
      severity: r.severity,
      is_required: r.is_required,
      sort_order: r.sort_order,
    });
  }
  return { playbook: pb, rules: await getRules(pb.id) };
}
