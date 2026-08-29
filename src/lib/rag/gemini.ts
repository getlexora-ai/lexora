// Self-contained Gemini REST client for the RAG pipeline: embeddings + a plain
// text completion. It deliberately does NOT import src/lib/llm.ts — that module
// pulls in `@/lib/errors` (a path alias + next/server), which a bare `node`
// script can't resolve. Keeping this leaf dependency-free is what lets
// `node scripts/rag-eval.mjs` import the .ts files directly.

import { loadEnvLocal } from "./load-env.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// GA embedding model. 3072-d native; we ask for 768 to keep the local index
// small. Truncated outputs are NOT pre-normalised, so we L2-normalise below and
// retrieval can treat cosine as a plain dot product.
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

// Matches the pin in src/lib/llm.ts — the `-latest` alias 503s under load.
export const GEN_MODEL = "gemini-3.6-flash";

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 65_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the API keeps returning 429 after we've exhausted our backoff. */
export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

/** Pull Google's suggested wait (seconds) out of a 429 body, if present. */
function retryDelayMs(body: string): number | undefined {
  // Structured: error.details[].retryDelay = "21s"
  const structured = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (structured) return Math.ceil(parseFloat(structured[1]) * 1000);
  // Free-text: "Please retry in 21.23419475s."
  const freeText = body.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (freeText) return Math.ceil(parseFloat(freeText[1]) * 1000);
  return undefined;
}

function apiKey(): string {
  loadEnvLocal();
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to lexora/.env.local or the environment.",
    );
  }
  return key;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const endpoint = url.split("/").pop() ?? url;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
    });

    if (res.ok) return (await res.json()) as Record<string, unknown>;

    const text = await res.text();

    if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
      // Honour Google's own retry hint; otherwise exponential backoff.
      const hinted = retryDelayMs(text);
      const backoff = hinted ?? attempt * 3000;
      await sleep(Math.min(backoff + 500, MAX_BACKOFF_MS));
      continue;
    }
    if (res.status === 429) {
      throw new QuotaExhaustedError(
        `Gemini quota exhausted at ${endpoint} after ${attempt} attempts. ` +
          `The free embedding tier allows ~100 requests/minute. ` +
          `Details: ${text.slice(0, 300)}`,
      );
    }
    throw new Error(`Gemini ${res.status} at ${endpoint}: ${text.slice(0, 500)}`);
  }
}

function l2normalise(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

export type EmbedTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY";

/**
 * Embed a batch of texts. Google caps `batchEmbedContents` at 100 requests and
 * ~20k tokens per call; we chunk at 50 to stay comfortably under both.
 * Returns L2-normalised vectors of length EMBED_DIM, aligned to `texts`.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType,
): Promise<number[][]> {
  const out: number[][] = [];
  // Each item in a batch counts as one request against the (free-tier ~100/min)
  // quota, so batching only saves round-trips. Keep batches small and pause
  // between them so a rate-limit costs little and self-heals.
  const BATCH = 20;
  const PAUSE_MS = 1500;

  for (let i = 0; i < texts.length; i += BATCH) {
    if (i > 0) await sleep(PAUSE_MS);
    const slice = texts.slice(i, i + BATCH);
    const data = await postJson(`${API_BASE}/${EMBED_MODEL}:batchEmbedContents`, {
      requests: slice.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      })),
    });

    const embeddings = data.embeddings as Array<{ values: number[] }> | undefined;
    if (!embeddings || embeddings.length !== slice.length) {
      throw new Error(
        `embedTexts: expected ${slice.length} vectors, got ${embeddings?.length ?? 0}`,
      );
    }
    for (const e of embeddings) out.push(l2normalise(e.values));
  }

  return out;
}

/** Embed a single string (convenience wrapper). */
export async function embedOne(
  text: string,
  taskType: EmbedTaskType,
): Promise<number[]> {
  const [v] = await embedTexts([text], taskType);
  return v;
}

/** One-shot text completion. Mirrors the generationConfig in src/lib/llm.ts. */
export async function complete(args: {
  system?: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "low" },
      maxOutputTokens: args.maxTokens,
    },
  };
  if (args.system) body.systemInstruction = { parts: [{ text: args.system }] };

  const data = await postJson(`${API_BASE}/${GEN_MODEL}:generateContent`, body);

  const candidates = data.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    | undefined;
  const parts = candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason: ${candidates?.[0]?.finishReason ?? "unknown"})`,
    );
  }
  return text;
}
