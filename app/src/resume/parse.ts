import { geminiGenerateJson } from "../providers/gemini/text";
import { REASONING_MODEL, REASONING_FALLBACKS } from "../providers/gemini/models";
import type { ParsedResume } from "./types";

/**
 * Resume text → structured memory.
 *
 * This is not "parse a PDF into fields". The interviewer needs to *know the
 * candidate*, so alongside the facts we ask the model to do what a senior
 * interviewer does while reading a resume before the call: decide what is
 * worth probing and where the story looks thin.
 */

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          period: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
        },
        required: ["company", "role", "period", "highlights"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          probeAngles: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "technologies", "probeAngles"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          institution: { type: "string" },
          degree: { type: "string" },
          period: { type: "string" },
        },
        required: ["institution", "degree", "period"],
      },
    },
  },
  required: ["name", "experience", "projects", "skills", "education"],
} as const;

const SYSTEM = `You are a senior engineer preparing to interview a candidate. You have their resume in front of you.

Extract the structured content faithfully — do not invent anything not present in the text. If a field is absent, use an empty array or omit it.

For each project, also fill "probeAngles": 2-4 specific things you would drill into during the interview. Good probe angles target where real understanding hides:
- architecture choices and the alternatives not taken
- claims that sound impressive but are unquantified or vague
- what likely broke or was hard, and how they would have debugged it
- trade-offs the design implies

Write probeAngles as short interviewer notes to yourself, e.g. "Says 'reduced latency 40%' — ask how it was measured and what the baseline was." Be skeptical but fair: these are the threads a good interviewer pulls, not accusations.`;

export async function parseResume(
  rawText: string,
  opts: { apiKey: string; model?: string },
): Promise<ParsedResume> {
  return geminiGenerateJson<ParsedResume>(
    {
      apiKey: opts.apiKey,
      model: opts.model ?? REASONING_MODEL,
      fallbackModels: REASONING_FALLBACKS,
      responseSchema: RESUME_SCHEMA as unknown as object,
      temperature: 0.2,
    },
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Resume text:\n\n${rawText}` },
    ],
  );
}
