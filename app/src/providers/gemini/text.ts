import type { ChatMessage, ProviderConfig } from "../types";

/**
 * Gemini text generation — the "reasoning model" role.
 *
 * Used off the voice path for: resume structuring, answer assessment,
 * candidate-model updates, and report generation. These calls must be cheap
 * and fast; several run *during* the interview while the candidate is
 * talking, so they must never block the audio loop.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiTextOptions extends ProviderConfig {
  /** JSON Schema — when set, the model is constrained to emit matching JSON. */
  responseSchema?: object;
  temperature?: number;
  /** Attempts on transient failures (503/429/5xx). Default 4. */
  maxAttempts?: number;
  /**
   * Models to try, in order, if `model` stays unavailable after retries.
   * Not theoretical: during Phase 2 validation `gemini-3.5-flash` returned
   * 503 on every attempt for both test resumes while `gemini-2.5-flash`
   * served them fine. On a BYOK free-tier key that must degrade, not fail.
   */
  fallbackModels?: string[];
}

/**
 * Transient upstream failures are not hypothetical: `gemini-3.5-flash`
 * returned 503 "high demand" during Phase 2 validation. A resume upload or
 * an in-interview assessment must not die because the model was briefly
 * busy, so transient statuses get exponential backoff with jitter.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * A 429 means two very different things.
 *
 * Rate limit  → too many requests per minute; backing off works.
 * Quota spent → the key's daily allowance is gone; backing off is futile and
 *               every retry just delays an error the user must act on.
 *
 * Free-tier keys hit the second case fast: one interview makes an assessment
 * call per answer plus a resume parse and a report, which is far more than a
 * free daily allowance. Telling the user plainly beats silently stalling.
 */
export class QuotaExhaustedError extends Error {
  constructor(detail: string) {
    super(
      "Your Gemini API key is out of quota for today. Free-tier keys don't have enough " +
        "daily requests for a full interview — enable billing on your key, or try again tomorrow.\n\n" +
        detail,
    );
    this.name = "QuotaExhaustedError";
  }
}

function isQuotaExhausted(status: number, detail: string): boolean {
  return status === 429 && /quota|billing/i.test(detail);
}

function isRetryable(status: number): boolean {
  return RETRYABLE.has(status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toGeminiContents(messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return { system, contents };
}

/**
 * One-shot text generation with retry and model fallback.
 * Returns the text plus which model actually served it.
 */
export async function geminiGenerateWithModel(
  opts: GeminiTextOptions,
  messages: ChatMessage[],
): Promise<{ text: string; model: string }> {
  const chain = [opts.model, ...(opts.fallbackModels ?? [])];
  let lastError: Error = new Error("no models attempted");

  for (const model of chain) {
    try {
      return { text: await generateOnce({ ...opts, model }, messages), model };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Quota is per-key, so another model won't help — surface it now.
      if (lastError instanceof QuotaExhaustedError) throw lastError;
      // Only fall through to the next model if this one is unavailable,
      // not if the request itself was bad — a 400 will fail identically
      // on every model and retrying it just burns the user's quota.
      if (!/^Gemini (429|5\d\d)/.test(lastError.message)) throw lastError;
    }
  }
  throw lastError;
}

/** One-shot text generation. Returns the raw text response. */
export async function geminiGenerate(
  opts: GeminiTextOptions,
  messages: ChatMessage[],
): Promise<string> {
  return (await geminiGenerateWithModel(opts, messages)).text;
}

async function generateOnce(
  opts: GeminiTextOptions,
  messages: ChatMessage[],
): Promise<string> {
  const { system, contents } = toGeminiContents(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseSchema
        ? { responseMimeType: "application/json", responseSchema: opts.responseSchema }
        : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const url = `${API_BASE}/models/${opts.model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
      if (!text) {
        const reason = json.candidates?.[0]?.finishReason ?? "unknown";
        throw new Error(`Gemini returned no text (finishReason: ${reason})`);
      }
      return text;
    }

    const detail = await res.text().catch(() => "");
    lastError = `Gemini ${res.status}: ${detail.slice(0, 300)}`;

    // Don't burn attempts (or the user's time) on a quota that won't refill
    // before tomorrow — and don't fall through to another model, since the
    // allowance is per-key, not per-model.
    if (isQuotaExhausted(res.status, detail)) {
      throw new QuotaExhaustedError(lastError);
    }
    if (!isRetryable(res.status) || attempt === maxAttempts) {
      throw new Error(lastError);
    }
    // Exponential backoff with jitter — avoids synchronized retries when
    // several assessment calls fail against a busy model at once.
    const backoff = 500 * 2 ** (attempt - 1);
    await sleep(backoff + Math.random() * 250);
  }

  throw new Error(lastError);
}

/** Structured generation: constrained JSON, parsed and typed. */
export async function geminiGenerateJson<T>(
  opts: GeminiTextOptions & { responseSchema: object },
  messages: ChatMessage[],
): Promise<T> {
  const text = await geminiGenerate(opts, messages);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini returned non-JSON despite schema: ${text.slice(0, 200)}`);
  }
}
