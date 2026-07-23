import { geminiGenerateJson } from "../providers/gemini/text";
import { ASSESSMENT_MODEL, ASSESSMENT_FALLBACKS } from "../providers/gemini/models";
import type { AnswerAssessment } from "./types";

/**
 * Answer assessment — the reasoning role, run off the voice path.
 *
 * Latency rule: this runs *while the interview continues*, never in front
 * of the interviewer's reply. The schema is deliberately tiny (one enum,
 * two short strings, one bool) because output tokens dominate latency here
 * and Phase 2 showed a large schema costs ~15-20s. See docs/VALIDATION.md.
 */

export const ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    quality: {
      type: "string",
      enum: ["strong", "adequate", "shallow", "evasive", "wrong"],
    },
    note: { type: "string" },
    suggestedProbe: { type: "string" },
    atKnowledgeLimit: { type: "boolean" },
  },
  required: ["quality", "note", "atKnowledgeLimit"],
} as const;

const SYSTEM = `You are evaluating one answer from a technical interview, as a senior interviewer would.

Judge REASONING, not recall. A candidate who derives an answer imperfectly from first principles is STRONGER than one who recites a correct definition without understanding. Penalise fluent-sounding answers that dodge the actual question.

quality:
- strong: demonstrates real understanding; earns a deeper probe
- adequate: correct but surface-level; one more layer may reveal more
- shallow: vague, buzzword-y, or hand-waves the hard part
- evasive: talks around the question without answering it
- wrong: factually incorrect

Saying "I don't know" plainly is NOT evasive. Evasion is pretending to answer.
A candidate who names their limit honestly is being straight with you — grade
whatever substance they did offer, and set atKnowledgeLimit. Never label
honesty as evasion; it is the behaviour a good interview should reward.

atKnowledgeLimit: true when further drilling on THIS thread would only produce
guessing — they have reached the edge of what they actually know. A good
interviewer notices this and moves on rather than grinding the candidate down.

note: one short clause of evidence for the report, e.g. "Explained paged-KV
tradeoffs precisely but couldn't justify the eviction policy."

suggestedProbe: if a deeper layer is worth pulling, the single most revealing
follow-up. Omit if atKnowledgeLimit.

Be concise. Your output is consumed by code, not read aloud.`;

export async function assessAnswer(
  input: {
    topic: string;
    question: string;
    answer: string;
    /** Layers already drilled on this thread — informs the limit judgement. */
    depth: number;
  },
  opts: { apiKey: string; model?: string },
): Promise<AnswerAssessment & { atKnowledgeLimit: boolean }> {
  return geminiGenerateJson<AnswerAssessment & { atKnowledgeLimit: boolean }>(
    {
      apiKey: opts.apiKey,
      model: opts.model ?? ASSESSMENT_MODEL,
      fallbackModels: ASSESSMENT_FALLBACKS,
      responseSchema: ASSESSMENT_SCHEMA as unknown as object,
      temperature: 0.1,
    },
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Topic: ${input.topic}\nLayers already drilled: ${input.depth}\n\nInterviewer asked: ${input.question}\n\nCandidate answered: ${input.answer}`,
      },
    ],
  );
}
