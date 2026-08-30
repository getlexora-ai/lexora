// Pure re-rank for clause-library semantic search. pgvector does the cosine
// ORDER BY (src/app/api/clause-library/search); this nudges that ordering by
// signal the vector space doesn't carry: an exact topic match, negotiating
// posture, and lawyer-review status. Kept pure + relative-import so it is
// unit-tested without a DB (mirrors the search()/queryIndex() split in
// src/lib/rag/store.ts).

/** Dot product. Embeddings are L2-normalised, so this equals cosine. Throws on a dimension mismatch. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export type RankCandidate = {
  id: string;
  /** cosine similarity from pgvector (1 = identical). */
  score: number;
  clause_type: string;
  posture: "preferred" | "fallback" | "walk_away";
  is_approved: boolean;
};

export type RankedCandidate = RankCandidate & { rankScore: number };

const TOPIC_MATCH_BONUS = 0.03;
const WALK_AWAY_PENALTY = 0.05;
const APPROVED_TIEBREAK = 0.005; // only separates otherwise-equal scores
const EPS = 1e-9;

/**
 * Re-rank pgvector's cosine hits. `queryTopic` is the topic the caller is
 * searching within (from a filter or `guessTopic`), or null for a free search.
 * Unapproved rows are NOT dropped — they just sort after an approved row of
 * equal merit.
 */
export function rankClauses(
  candidates: RankCandidate[],
  queryTopic: string | null,
): RankedCandidate[] {
  const ranked = candidates.map((c) => {
    let s = c.score;
    if (queryTopic && c.clause_type === queryTopic) s += TOPIC_MATCH_BONUS;
    if (c.posture === "walk_away") s -= WALK_AWAY_PENALTY;
    if (c.is_approved) s += APPROVED_TIEBREAK;
    return { ...c, rankScore: s };
  });

  ranked.sort((a, b) => {
    if (Math.abs(a.rankScore - b.rankScore) > EPS) return b.rankScore - a.rankScore;
    if (a.is_approved !== b.is_approved) return a.is_approved ? -1 : 1;
    return b.score - a.score;
  });

  return ranked;
}
