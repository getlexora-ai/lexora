// Data layer for contract templates (see db/007_contract_templates.sql).
//
// Visibility: a signed-in user sees their own rows plus every system-curated
// row (user_id IS NULL). Writes go only to rows they own — curated rows are
// read-only through the API (source = 'curated' writes are rejected here and in
// the routes via ownsTemplate).
//
// Modelled on src/lib/clause-library.ts.

import { query, queryOne } from "@/lib/db";

export type TemplateSection = {
  key: string;
  heading: string;
  clause_type: string;
  clause_id: string | null;
  required: boolean;
};

export type TemplateVariable = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "currency" | "derived";
  required?: boolean;
  maps_to?: string;
  group?: string;
  expr?: string;
  options?: string[];
};

export type ContractTemplate = {
  id: string;
  user_id: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  contract_type: string;
  language: string;
  body: string;
  body_en: string | null;
  sections: TemplateSection[];
  variables: TemplateVariable[];
  source: "curated" | "user";
  doc_ref: string | null;
  based_on_contract_id: string | null;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  /** true when this row is system-curated (not editable by the caller). */
  readonly?: boolean;
};

const COLUMNS = `
  id, user_id, name, name_en, description, contract_type, language,
  body, body_en, sections, variables, source, doc_ref, based_on_contract_id,
  is_approved, approved_by, approved_at, tags, created_at, updated_at,
  (user_id is null) as readonly
`;

export type ListParams = {
  userId: string;
  contractType?: string;
  source?: "curated" | "user";
  language?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type ListResult = { templates: ContractTemplate[]; total: number };

/** List visible templates (own + curated) with optional filters + lexical search. */
export async function listTemplates(p: ListParams): Promise<ListResult> {
  const where: string[] = ["t.deleted_at is null"];
  const params: unknown[] = [];
  const bind = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const me = bind(p.userId);
  where.push(`(t.user_id = ${me} or t.user_id is null)`);

  if (p.contractType) where.push(`t.contract_type = ${bind(p.contractType)}`);
  if (p.source) where.push(`t.source = ${bind(p.source)}`);
  if (p.language) where.push(`t.language = ${bind(p.language)}`);

  if (p.q && p.q.trim()) {
    const like = bind(`%${p.q.trim()}%`);
    where.push(`(t.name ilike ${like} or t.name_en ilike ${like} or t.description ilike ${like})`);
  }

  const whereSql = where.join("\n    and ");

  const totalRow = await queryOne<{ n: string }>(
    `select count(*)::int as n from contract_templates t where ${whereSql}`,
    params,
  );

  const limit = Math.min(Math.max(p.limit ?? 100, 1), 200);
  const offset = Math.max(p.offset ?? 0, 0);
  const templates = await query<ContractTemplate>(
    `select ${COLUMNS}
       from contract_templates t
      where ${whereSql}
      order by t.is_approved desc, t.updated_at desc
      limit ${bind(limit)} offset ${bind(offset)}`,
    params,
  );

  return { templates, total: Number(totalRow?.n ?? 0) };
}

/** One template the user may see (own or curated), or null. */
export async function getTemplate(id: string, userId: string): Promise<ContractTemplate | null> {
  return queryOne<ContractTemplate>(
    `select ${COLUMNS}
       from contract_templates t
      where t.id = $1 and t.deleted_at is null
        and (t.user_id = $2 or t.user_id is null)`,
    [id, userId],
  );
}

export type CreateInput = {
  name: string;
  contract_type: string;
  body: string;
  name_en?: string | null;
  description?: string | null;
  language?: string;
  body_en?: string | null;
  sections?: TemplateSection[];
  variables?: TemplateVariable[];
  tags?: string[];
  based_on_contract_id?: string | null;
};

/** Insert a user-owned template. `is_approved` is always false on create (RDG). */
export async function createTemplate(userId: string, input: CreateInput): Promise<ContractTemplate> {
  const row = await queryOne<ContractTemplate>(
    `insert into contract_templates
       (user_id, name, name_en, description, contract_type, language,
        body, body_en, sections, variables, tags, based_on_contract_id, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,'user')
     returning ${COLUMNS}`,
    [
      userId,
      input.name,
      input.name_en ?? null,
      input.description ?? null,
      input.contract_type,
      input.language ?? "de",
      input.body,
      input.body_en ?? null,
      JSON.stringify(input.sections ?? []),
      JSON.stringify(input.variables ?? []),
      input.tags ?? [],
      input.based_on_contract_id ?? null,
    ],
  );
  if (!row) throw new Error("template insert returned nothing");
  return row;
}

const EDITABLE = new Set([
  "name", "name_en", "description", "contract_type", "language",
  "body", "body_en", "sections", "variables", "tags", "is_approved",
]);
const JSONB_COLS = new Set(["sections", "variables"]);

/**
 * Patch an owned template. Caller must have verified ownership first
 * (ownsTemplate). Setting `is_approved` stamps `approved_by` / `approved_at`
 * (the RDG "a lawyer reviewed this" record).
 */
export async function updateTemplate(
  id: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<ContractTemplate | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (frag: string, val: unknown) => {
    params.push(val);
    sets.push(frag.replace("$?", `$${params.length}`));
  };

  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "is_approved") {
      add("is_approved = $?", !!v);
      if (v) {
        add("approved_by = $?", userId);
        sets.push(`approved_at = now()`);
      } else {
        sets.push(`approved_by = null`, `approved_at = null`);
      }
      continue;
    }
    if (JSONB_COLS.has(k)) {
      add(`${k} = $?::jsonb`, JSON.stringify(v ?? []));
      continue;
    }
    add(`${k} = $?`, v);
  }
  if (sets.length === 0) return getTemplate(id, userId);

  params.push(id, userId);
  return queryOne<ContractTemplate>(
    `update contract_templates set ${sets.join(", ")}
      where id = $${params.length - 1} and user_id = $${params.length} and deleted_at is null
      returning ${COLUMNS}`,
    params,
  );
}

/** Soft-delete an owned template. */
export async function softDeleteTemplate(id: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update contract_templates set deleted_at = now()
      where id = $1 and user_id = $2 and deleted_at is null
      returning id`,
    [id, userId],
  );
  return row !== null;
}
