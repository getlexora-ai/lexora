import { query, queryOne } from "@/lib/db";
import {
  CONSENT_DOCS,
  POLICY_VERSION,
  type ConsentDoc,
} from "@/lib/legal/policies";

export type ConsentMethod = "signup" | "reprompt" | "settings";

export type ConsentEvent = {
  user_id: string;
  policy_version: string;
  docs: ConsentDoc[];
  method: string;
  created_at: string;
};

/**
 * Record a user's acceptance of the current legal documents. Idempotent: the
 * unique (user_id, policy_version) index turns a repeat into a no-op.
 */
export async function recordConsent(opts: {
  userId: string;
  version?: string;
  docs?: readonly ConsentDoc[];
  method?: ConsentMethod;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const version = opts.version ?? POLICY_VERSION;
  const docs = [...(opts.docs ?? CONSENT_DOCS)];
  await query(
    `insert into consent_events (user_id, policy_version, docs, method, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, policy_version) do nothing`,
    [
      opts.userId,
      version,
      docs,
      opts.method ?? "signup",
      opts.ip ?? null,
      opts.userAgent ?? null,
    ],
  );
}

/** The most recent consent event for a user, or null. */
export async function getLatestConsent(
  userId: string,
): Promise<ConsentEvent | null> {
  return queryOne<ConsentEvent>(
    `select user_id, policy_version, docs, method, created_at
       from consent_events
      where user_id = $1
      order by created_at desc
      limit 1`,
    [userId],
  );
}

/** True when the user has accepted the policy version currently in force. */
export async function hasCurrentConsent(userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `select true as ok
       from consent_events
      where user_id = $1 and policy_version = $2
      limit 1`,
    [userId, POLICY_VERSION],
  );
  return row?.ok === true;
}
