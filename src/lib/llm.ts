// Thin LLM adapter over Google's Gemini REST API.
// Every AI route in the app goes through askLLM() so the provider lives in one place.

import { AppError } from "@/lib/errors";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Pinned on purpose: the `gemini-flash-latest` alias is frequently 503 "high
// demand", while the pinned build has capacity. Bump this when a newer flash
// build ships.
export const FLASH = "gemini-3.6-flash";
// NOTE: the Pro models are not on the free tier (they 429 with "limit: 0").
// Only switch analysis routes to PRO once the key is on a paid plan.
export const PRO = "gemini-pro-latest";

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Turn = { role: "user" | "assistant"; content: string };

type AskArgs = {
  /** System instruction (persona, context, rules). */
  system?: string;
  /** Convenience for a single user turn. Ignored if `messages` is given. */
  prompt?: string;
  /** Full multi-turn history, oldest first. The last turn should be the user's. */
  messages?: Turn[];
  /** Hard cap on output tokens. */
  maxTokens: number;
  /** Defaults to FLASH. */
  model?: string;
  /**
   * When set, Gemini is forced to return a JSON string matching this schema
   * (structured output) — no prose, no ``` fences, always parseable.
   * Use a Gemini/OpenAPI-style schema object.
   */
  responseSchema?: Record<string, unknown>;
};

export async function askLLM({
  system,
  prompt,
  messages,
  maxTokens,
  model = FLASH,
  responseSchema,
}: AskArgs): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AppError(500, "llm_config", "The AI service isn't configured yet.");

  const turns: Turn[] = messages ?? (prompt ? [{ role: "user", content: prompt }] : []);
  if (turns.length === 0) throw new Error("askLLM: no prompt or messages provided");

  const body: Record<string, unknown> = {
    contents: turns.map(t => ({
      // Gemini uses "model" where Anthropic/OpenAI use "assistant".
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    generationConfig: {
      // Gemini 3.x always "thinks" (~70-200 tokens) before answering and it
      // counts against maxOutputTokens — callers budget for that. "low" keeps
      // the overhead small; `thinkingBudget: 0` is rejected on 3.x.
      thinkingConfig: { thinkingLevel: "low" },
      maxOutputTokens: maxTokens,
      ...(responseSchema
        ? { responseMimeType: "application/json", responseSchema }
        : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res: Response;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    // 503 = model overloaded, 429 = rate limit — both are transient on the free tier.
    if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
      await sleep(attempt * 2000);
      continue;
    }
    break;
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[llm] Gemini ${res.status}: ${body}`);
    if (res.status === 503 || res.status === 429) {
      throw new AppError(503, "llm_busy", "The AI service is busy right now. Please try again in a moment.");
    }
    throw new AppError(502, "llm_error", "The AI service returned an error. Please try again.");
  }

  const data = await res.json();

  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) {
    console.error(`[llm] Gemini blocked the prompt: ${blocked}`);
    throw new AppError(422, "llm_blocked", "That request couldn't be processed by the AI service.");
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const finish = data?.candidates?.[0]?.finishReason ?? "unknown";
    console.error(`[llm] Gemini returned no text (finishReason: ${finish})`);
    throw new AppError(502, "llm_no_output", "The AI service didn't return a result. Please try again.");
  }

  return text;
}
