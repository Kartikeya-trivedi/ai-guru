import { geminiGenerateJson } from "./gemini/text";
import {
  ASSESSMENT_MODEL,
  ASSESSMENT_FALLBACKS,
  REASONING_MODEL,
  REASONING_FALLBACKS,
} from "./gemini/models";
import { groqGenerateJson } from "./groq/text";
import {
  GROQ_ASSESSMENT_MODEL,
  GROQ_ASSESSMENT_FALLBACKS,
  GROQ_REASONING_MODEL,
  GROQ_REASONING_FALLBACKS,
} from "./groq/models";
import { getKey } from "./keys";
import type { ChatMessage } from "./types";

/**
 * The reasoning role, provider-neutral.
 *
 * Everything the app does with a text model — resume structuring, JD
 * extraction, answer assessment, DSA judging, report generation — goes
 * through here, so swapping providers is one setting rather than five
 * edits. The realtime voice role deliberately does NOT go through here:
 * Gemini Live is the only native speech-to-speech among our providers, and
 * pretending otherwise would hide a large latency regression behind a
 * dropdown.
 *
 * Two roles, because they have genuinely different constraints:
 *  - assessment runs DURING the interview, so it takes the fastest capable
 *    model and a tiny schema.
 *  - reasoning runs off the critical path, so it takes the better model.
 */

export type ReasoningProviderId = "gemini" | "groq";
export type ReasoningRole = "assessment" | "reasoning";

const STORAGE_KEY = "ai-guru.reasoningProvider";

/**
 * Which provider handles text. A UI preference, not a secret, so it lives in
 * localStorage rather than the keychain. Gemini is the default because it is
 * already required for voice — nobody has to add a second key to get started.
 */
export function getReasoningProvider(): ReasoningProviderId {
  if (typeof localStorage === "undefined") return "gemini";
  return localStorage.getItem(STORAGE_KEY) === "groq" ? "groq" : "gemini";
}

export function setReasoningProvider(id: ReasoningProviderId): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
}

export interface ReasoningRequest {
  role: ReasoningRole;
  /**
   * The Gemini key, which callers already hold — Gemini is required for voice
   * regardless of this setting, so it is always available. A Groq key is
   * resolved from the keychain here instead, since only this layer knows
   * whether Groq is the active provider.
   */
  apiKey: string;
  /** Escape hatch. Must be an id the ACTIVE provider recognises. */
  model?: string;
  responseSchema: object;
  temperature?: number;
}

export async function generateJson<T>(
  req: ReasoningRequest,
  messages: ChatMessage[],
): Promise<T> {
  const assessment = req.role === "assessment";

  if (getReasoningProvider() === "groq") {
    const key = await getKey("groq");
    if (!key) {
      throw new Error(
        "Groq is selected for grading and reports, but no Groq key is saved. " +
          "Add one in Settings, or switch the text provider back to Gemini.",
      );
    }
    return groqGenerateJson<T>(
      {
        apiKey: key,
        model: req.model ?? (assessment ? GROQ_ASSESSMENT_MODEL : GROQ_REASONING_MODEL),
        fallbackModels: assessment ? GROQ_ASSESSMENT_FALLBACKS : GROQ_REASONING_FALLBACKS,
        responseSchema: req.responseSchema,
        temperature: req.temperature,
        reasoningEffort: assessment ? "low" : "medium",
      },
      messages,
    );
  }

  return geminiGenerateJson<T>(
    {
      apiKey: req.apiKey,
      model: req.model ?? (assessment ? ASSESSMENT_MODEL : REASONING_MODEL),
      fallbackModels: assessment ? ASSESSMENT_FALLBACKS : REASONING_FALLBACKS,
      responseSchema: req.responseSchema,
      temperature: req.temperature,
    },
    messages,
  );
}
