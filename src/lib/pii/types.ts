// PII pseudonymisation — shared types.
//
// Pure — NO `@/` imports — so `node --test` can import the pure modules
// (`pseudonyms.ts`, `detect.ts`, `index.ts`) directly. The LLM layer lives in
// `llm-scan.ts` and is the only file here that pulls in the app.

export type PiiKind =
  | "name"
  | "address"
  | "email"
  | "phone"
  | "iban"
  | "tax-id"
  | "date"
  | "other";

/** Which detection layer produced a match. */
export type PiiLayer = "dictionary" | "patterns" | "llm-scan";

/**
 * How the real value is disguised on the wire:
 * - `fake`   realistic German stand-in (`Anna Schmidt`) — best generation quality
 * - `token`  typed placeholder (`[NAME_1]`) — unambiguous, easy to audit
 * - `opaque` short hash tag (`⟦a1b2c3d4⟧`) — vault-style, leaks nothing about the value
 */
export type PseudonymStyle = "fake" | "token" | "opaque";

/** One detected span of sensitive text, before a pseudonym is assigned. */
export type PiiMatch = {
  /** exact substring as it appears in the source */
  real: string;
  kind: PiiKind;
  layer: PiiLayer;
};

/** A real value bound to the pseudonym that replaces it. */
export type PiiEntry = PiiMatch & { pseudonym: string };

export type PiiMap = { entries: PiiEntry[] };
