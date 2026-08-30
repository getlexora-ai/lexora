// Data layer for the clause library (see db/006_clause_library.sql).
//
// Visibility: a signed-in user sees their own rows plus every system-curated
// row (user_id IS NULL). Writes go only to rows they own — curated rows are
// read-only through the API (enforced with ownsLibraryClause in the routes).
//
// Search here is lexical only (German full-text + ILIKE fallback). Semantic
// search over `embedding` is Wave 2 and lives in its own route.

import { query, queryOne } from "@/lib/db";
import { isKnownTopic } from "@/lib/clause-taxonomy";

export type LibraryClause = {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  title_en: string | null;
  content_en: string | null;
  summary: string | null;
  clause_type: string;
  reference: string | null;
  jurisdiction: string;
  contract_types: string[];
  tags: string[];
  source: "curated" | "user" | "imported";
  posture: "preferred" | "fallback" | "walk_away";
  doc_ref: string | null;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  /** true when this row is system-curated (not editable by the caller). */
  readonly?: boolean;
};

// Everything the UI needs; never selects `embedding`.
const COLUMNS = `
  id, user_id, title, content, title_en, content_en, summary,
  clause_type, reference, jurisdiction, contract_types, tags,
  source, posture, doc_ref, is_approved, approved_by, approved_at,
  created_at, updated_at,
  (user_id is null) as readonly
`;

export type ListParams = {
  userId: string;
  type?: string;
  posture?: string;
  scope?: "all" | "mine" | "curated";
  q?: string;
  tag?: string;
  approvedOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type ListResult = { clauses: LibraryClause[]; total: number };

/** List visible clauses with optional filters + lexical search. */
export async function listClauses(p: ListParams): Promise<ListResult> {
  const where: string[] = ["cl.deleted_at is null"];
  const params: unknown[] = [];
  const bind = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  // visibility
  const me = bind(p.userId);
  if (p.scope === "mine") where.push(`cl.user_id = ${me}`);
  else if (p.scope === "curated") where.push(`cl.user_id is null`);
  else where.push(`(cl.user_id = ${me} or cl.user_id is null)`);

  if (p.type && isKnownTopic(p.type)) where.push(`cl.clause_type = ${bind(p.type)}`);
  if (p.posture) where.push(`cl.posture = ${bind(p.posture)}`);
  if (p.tag) where.push(`${bind(p.tag)} = any(cl.tags)`);
  if (p.approvedOnly) where.push(`cl.is_approved`);

  if (p.q && p.q.trim()) {
    const term = bind(p.q.trim());
    const like = bind(`%${p.q.trim()}%`);
    where.push(`(
      to_tsvector('german', coalesce(cl.title,'') || ' ' || coalesce(cl.summary,'') || ' ' || coalesce(cl.content,''))
        @@ websearch_to_tsquery('german', ${term})
      or cl.title ilike ${like}
      or cl.summary ilike ${like}
      or cl.content ilike ${like}
    )`);
  }

  const whereSql = where.join("\n    and ");

  const totalRow = await queryOne<{ n: string }>(
    `select count(*)::int as n from clause_library cl where ${whereSql}`,
    params,
  );

  const limit = Math.min(Math.max(p.limit ?? 50, 1), 200);
  const offset = Math.max(p.offset ?? 0, 0);
  const clauses = await query<LibraryClause>(
    `select ${COLUMNS}
       from clause_library cl
      where ${whereSql}
      order by cl.is_approved desc, cl.updated_at desc
      limit ${bind(limit)} offset ${bind(offset)}`,
    params,
  );

  return { clauses, total: Number(totalRow?.n ?? 0) };
}

/** One clause the user may see (own or curated), or null. */
export async function getClause(id: string, userId: string): Promise<LibraryClause | null> {
  return queryOne<LibraryClause>(
    `select ${COLUMNS}
       from clause_library cl
      where cl.id = $1 and cl.deleted_at is null
        and (cl.user_id = $2 or cl.user_id is null)`,
    [id, userId],
  );
}

export type CreateInput = {
  title: string;
  content: string;
  clause_type: string;
  title_en?: string | null;
  content_en?: string | null;
  summary?: string | null;
  reference?: string | null;
  posture?: "preferred" | "fallback" | "walk_away";
  tags?: string[];
  contract_types?: string[];
  source?: "user" | "imported";
};

/** Insert a user-owned clause. `is_approved` is always false on create (RDG). */
export async function createClause(userId: string, input: CreateInput): Promise<LibraryClause> {
  const row = await queryOne<LibraryClause>(
    `insert into clause_library
       (user_id, title, content, title_en, content_en, summary, clause_type,
        reference, posture, tags, contract_types, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning ${COLUMNS}`,
    [
      userId,
      input.title,
      input.content,
      input.title_en ?? null,
      input.content_en ?? null,
      input.summary ?? null,
      input.clause_type,
      input.reference ?? null,
      input.posture ?? "preferred",
      input.tags ?? [],
      input.contract_types ?? [],
      input.source ?? "user",
    ],
  );
  if (!row) throw new Error("clause insert returned nothing");
  return row;
}

const EDITABLE = new Set([
  "title", "content", "title_en", "content_en", "summary",
  "clause_type", "reference", "posture", "tags", "contract_types",
  "is_approved",
]);

/**
 * Patch an owned clause. Caller must have verified ownership first
 * (ownsLibraryClause). Editing `content` clears `embedded_at` so the next
 * `seed:library --embed` pass re-vectorises it. Setting `is_approved` stamps
 * `approved_by` / `approved_at` (the RDG "a lawyer reviewed this" record).
 */
export async function updateClause(
  id: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<LibraryClause | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "is_approved") {
      add("is_approved", !!v);
      if (v) {
        add("approved_by", userId);
        sets.push(`approved_at = now()`);
      } else {
        sets.push(`approved_by = null`, `approved_at = null`);
      }
      continue;
    }
    add(k, v);
  }
  if ("content" in patch) sets.push(`embedded_at = null`);
  if (sets.length === 0) return getClause(id, userId);

  params.push(id, userId);
  return queryOne<LibraryClause>(
    `update clause_library set ${sets.join(", ")}
      where id = $${params.length - 1} and user_id = $${params.length} and deleted_at is null
      returning ${COLUMNS}`,
    params,
  );
}

/** Soft-delete an owned clause. */
export async function softDeleteClause(id: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update clause_library set deleted_at = now()
      where id = $1 and user_id = $2 and deleted_at is null
      returning id`,
    [id, userId],
  );
  return row !== null;
}

// ── semantic search (Wave 2) ────────────────────────────────────────────────

export type SemanticHit = LibraryClause & { score: number; rankScore: number };

/**
 * Embed `queryText` with Gemini, cosine-rank visible clauses that have an
 * embedding, then re-rank in JS (topic match / posture / approval). Falls back
 * to lexical `listClauses` when embedding fails or nothing is indexed — the
 * library must stay usable without an API key.
 */
export async function searchClauses(
  userId: string,
  queryText: string,
  opts: { type?: string; topK?: number } = {},
): Promise<{ hits: SemanticHit[]; mode: "semantic" | "lexical" }> {
  const topK = Math.min(Math.max(opts.topK ?? 20, 1), 50);
  const trimmed = queryText.trim();
  if (!trimmed) return { hits: [], mode: "lexical" };

  const lexicalFallback = async (): Promise<{ hits: SemanticHit[]; mode: "lexical" }> => {
    const { clauses } = await listClauses({ userId, q: trimmed, type: opts.type, limit: topK });
    return {
      mode: "lexical",
      hits: clauses.map((c) => ({ ...c, score: 0, rankScore: 0 })),
    };
  };

  let queryVec: number[];
  try {
    const { embedOne } = await import("@/lib/rag/gemini");
    queryVec = await embedOne(trimmed, "RETRIEVAL_QUERY");
  } catch {
    return lexicalFallback();
  }

  const literal = `[${queryVec.join(",")}]`;
  const params: unknown[] = [userId, literal];
  let typeFilter = "";
  if (opts.type && isKnownTopic(opts.type)) {
    params.push(opts.type);
    typeFilter = `and cl.clause_type = $3`;
  }
  params.push(topK);

  const rows = await query<LibraryClause & { score: string }>(
    `select ${COLUMNS}, 1 - (cl.embedding <=> $2::vector) as score
       from clause_library cl
      where cl.deleted_at is null
        and cl.embedding is not null
        and (cl.user_id = $1 or cl.user_id is null)
        ${typeFilter}
      order by cl.embedding <=> $2::vector
      limit $${params.length}`,
    params,
  );

  if (rows.length === 0) return lexicalFallback();

  const { rankClauses } = await import("@/lib/library/rank");
  const ranked = rankClauses(
    rows.map((r) => ({
      id: r.id,
      score: Number(r.score),
      clause_type: r.clause_type,
      posture: r.posture,
      is_approved: r.is_approved,
    })),
    opts.type && isKnownTopic(opts.type) ? opts.type : null,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    mode: "semantic",
    hits: ranked.map((rk) => {
      const row = byId.get(rk.id)!;
      const { score: _s, ...rest } = row;
      return { ...(rest as LibraryClause), score: Number(row.score), rankScore: rk.rankScore };
    }),
  };
}

/** "Save to library" from the review screen — an imported clause. */
export async function saveFromSuggestion(
  userId: string,
  input: { title: string; content: string; clause_type: string; reference?: string | null; summary?: string | null; tags?: string[] },
): Promise<LibraryClause> {
  return createClause(userId, {
    title: input.title,
    content: input.content,
    clause_type: isKnownTopic(input.clause_type) ? input.clause_type : "sonstiges",
    reference: input.reference ?? null,
    summary: input.summary ?? null,
    tags: input.tags ?? [],
    source: "imported",
  });
}
