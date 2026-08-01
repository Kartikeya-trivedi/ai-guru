import { geminiGenerateJson } from "../providers/gemini/text";
import { REASONING_MODEL, REASONING_FALLBACKS } from "../providers/gemini/models";

/**
 * Job-description awareness.
 *
 * The PRD promises the technical round adapts to the target role. That needs
 * the pasted JD turned into concrete areas to probe — otherwise the JD is
 * accepted in the UI and silently ignored. This runs once before the
 * interview starts, so its latency is off the voice path.
 */

const SCHEMA = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["requirements"],
} as const;

const SYSTEM = `You are a senior interviewer prepping for a screen. Read the job description and extract the 4-8 concrete technical areas this role actually tests — the things you would probe in the interview.

Be specific and testable: "distributed training / multi-GPU" not "machine learning"; "Kubernetes operators and CRDs" not "cloud". Skip fluff (culture, benefits, "fast-paced environment"). Return the areas most central to the role first.`;

export async function extractRequirements(
  jobDescription: string,
  opts: { apiKey: string; model?: string },
): Promise<string[]> {
  const trimmed = jobDescription.trim();
  if (trimmed.length < 40) return [];
  const { requirements } = await geminiGenerateJson<{ requirements: string[] }>(
    {
      apiKey: opts.apiKey,
      model: opts.model ?? REASONING_MODEL,
      fallbackModels: REASONING_FALLBACKS,
      responseSchema: SCHEMA as unknown as object,
      temperature: 0.2,
    },
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Job description:\n\n${trimmed}` },
    ],
  );
  return requirements;
}
