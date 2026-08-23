import type { ChatMessage, ProviderConfig } from "../types";
import { GROQ_BASE_URL } from "./models";
import { toStrictSchema, stripNulls } from "../schema";

/**
 * Groq text generation — an alternative to Gemini for the reasoning role.
 *
 * Groq's API is OpenAI-compatible, so this is a chat-completions client with
 * the same operational behaviour as the Gemini one: retry transient failures
 * with backoff, fall through a model chain when a model is unavailable, and
 * fail fast (never retry) when the key itself is out of quota.
 *
 * The realtime voice role is deliberately NOT implemented here. Groq has no
 * native speech-to-speech; reaching voice through it means Whisper then a
 * text model then TTS, three sequential network round trips where Gemini
 * Live does one. See docs/VALIDATION.md for why that budget matters.
 */

export interface GroqTextOptions extends ProviderConfig {
  responseSchema?: object;
  temperature?: number;
  maxAttempts?: number;
  fallbackModels?: string[];
  /**
   * How many reasoning tokens gpt-oss may spend before answering. This is a
   * latency knob, not a quality dial: assessment runs while the candidate is
   * still talking, so it takes "low" — the schema is four fields and the
   * judgement is one that a senior interviewer makes in a second. Report
   * generation runs off the critical path and can afford to think.
   */
  reasoningEffort?: "low" | "medium" | "high";
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Groq returns 429 both for "slow down" and for "you have spent your daily
 * allowance". Only the first is worth retrying; the second needs the user to
 * do something, and backing off just delays telling them.
 */
export class GroqQuotaExhaustedError extends Error {
  constructor(detail: string) {
    super(
      "Your Groq API key is out of quota. Free-tier Groq keys have a daily token " +
        "allowance that a full interview can exhaust — wait for the reset, upgrade the key, " +
        "or switch the reasoning provider back to Gemini in Settings.\n\n" +
        detail,
    );
    this.name = "GroqQuotaExhaustedError";
  }
}

/** Groq signals daily-allowance exhaustion in the error body, not the status. */
function isQuotaExhausted(status: number, detail: string): boolean {
  return status === 429 && /tokens per day|requests per day|TPD|RPD|quota/i.test(detail);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function groqGenerate(
  opts: GroqTextOptions,
  messages: ChatMessage[],
): Promise<string> {
  const chain = [opts.model, ...(opts.fallbackModels ?? [])];
  let lastError: Error = new Error("no models attempted");

  for (const model of chain) {
    try {
      return await generateOnce({ ...opts, model }, messages);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Quota is per-key, so another model cannot help.
      if (lastError instanceof GroqQuotaExhaustedError) throw lastError;
      // Only fall through when this model was unavailable. A 400 is a bad
      // request and will fail identically everywhere.
      if (!/^Groq (408|429|5\d\d)/.test(lastError.message)) throw lastError;
    }
  }
  throw lastError;
}

async function generateOnce(
  opts: GroqTextOptions,
  messages: ChatMessage[],
): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.2,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    // gpt-oss returns its thinking in a separate `reasoning` field, so this
    // only stops us paying to transfer tokens we discard; `content` is
    // unaffected either way.
    include_reasoning: false,
  };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;

  if (opts.responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: toStrictSchema(opts.responseSchema),
      },
    };
  }

  const maxAttempts = opts.maxAttempts ?? 4;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${opts.baseUrl ?? GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      const choice = json.choices?.[0];
      const text: string = choice?.message?.content ?? "";
      if (!text) {
        throw new Error(`Groq returned no text (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
      }
      return text;
    }

    const detail = await res.text().catch(() => "");
    lastError = `Groq ${res.status}: ${detail.slice(0, 300)}`;

    if (isQuotaExhausted(res.status, detail)) throw new GroqQuotaExhaustedError(lastError);
    if (!RETRYABLE.has(res.status) || attempt === maxAttempts) throw new Error(lastError);

    const backoff = 500 * 2 ** (attempt - 1);
    await sleep(backoff + Math.random() * 250);
  }

  throw new Error(lastError);
}

/** Structured generation: schema-constrained JSON, parsed and typed. */
export async function groqGenerateJson<T>(
  opts: GroqTextOptions & { responseSchema: object },
  messages: ChatMessage[],
): Promise<T> {
  const text = await groqGenerate(opts, messages);
  try {
    // Strict mode fills optional fields with null; our types expect absent.
    return stripNulls(JSON.parse(text)) as T;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Groq returned non-JSON despite schema: ${text.slice(0, 200)}`);
    }
    throw e;
  }
}
