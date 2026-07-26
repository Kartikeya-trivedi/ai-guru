import { geminiGenerateJson } from "../providers/gemini/text";
import { REASONING_MODEL, REASONING_FALLBACKS } from "../providers/gemini/models";
import type { Problem } from "./problems";
import type { RunOutcome } from "./harness";

/**
 * The AI half of hybrid judging.
 *
 * Test cases answer "is it correct?". They cannot answer the questions a
 * human interviewer actually scores: did they reach the right complexity,
 * did they see the edge cases themselves, is the code something you'd want
 * in a codebase, and did they get there by reasoning or by pattern-matching?
 *
 * Test results are passed IN as ground truth so the judge cannot contradict
 * them — a model talking itself into "looks correct to me" over a failing
 * suite is exactly the failure mode hybrid judging exists to prevent.
 */

export interface CodeVerdict {
  /** Did they reach the intended complexity? */
  complexityReached: string;
  complexityOptimal: boolean;
  /** Edge cases the candidate raised WITHOUT being told. */
  edgeCasesAnticipated: string[];
  edgeCasesMissed: string[];
  codeQuality: 1 | 2 | 3 | 4 | 5;
  reasoningQuality: 1 | 2 | 3 | 4 | 5;
  /** Written for the candidate, direct and specific. */
  summary: string;
}

export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    complexityReached: { type: "string" },
    complexityOptimal: { type: "boolean" },
    edgeCasesAnticipated: { type: "array", items: { type: "string" } },
    edgeCasesMissed: { type: "array", items: { type: "string" } },
    codeQuality: { type: "integer", minimum: 1, maximum: 5 },
    reasoningQuality: { type: "integer", minimum: 1, maximum: 5 },
    summary: { type: "string" },
  },
  required: [
    "complexityReached",
    "complexityOptimal",
    "edgeCasesAnticipated",
    "edgeCasesMissed",
    "codeQuality",
    "reasoningQuality",
    "summary",
  ],
} as const;

const SYSTEM = `You are a senior engineer judging a candidate's coding-round solution, the way you would in a real interview.

The test results given to you are GROUND TRUTH from actually executing the code. Never contradict them. If tests failed, the solution is wrong regardless of how good it looks — your job is to explain what the failure reveals, not to argue with it. If tests passed, do not invent correctness problems; judge the things tests cannot see.

Judge what a human interviewer scores:
- complexity actually achieved vs. the intended optimum
- which edge cases they raised THEMSELVES, unprompted, in the discussion before coding — anticipating an edge case is a much stronger signal than handling one you were told about
- code quality: would you accept this in review? naming, structure, clarity under pressure
- reasoning quality: did they derive the approach, or pattern-match a memorised template? A candidate who reasons to a slightly worse solution beats one who recites the optimal one without understanding it.

Passing every test with a brute-force solution is NOT a strong outcome — say so plainly.
A near-miss with sound reasoning is worth more than a lucky pass — say that too.

summary: 2-3 sentences, written TO the candidate ("you"), specific and direct. No filler.`;

export interface JudgeInput {
  problem: Problem;
  language: string;
  source: string;
  /** Undefined for languages we can't execute — judge on reading alone. */
  outcome?: RunOutcome;
  /** What they said before writing code — where anticipation shows up. */
  discussionTranscript: string;
}

function renderOutcome(outcome?: RunOutcome): string {
  if (!outcome) {
    return "TEST RESULTS: not executed (this language is judged by reading only). Do not claim tests passed or failed.";
  }
  if (outcome.compileError) {
    return `TEST RESULTS: the program did not run.\n${outcome.compileError}`;
  }
  const lines = outcome.results
    .map((r) => {
      if (r.error) return `  case ${r.index + 1}: ERROR — ${r.error}`;
      return `  case ${r.index + 1}: ${r.passed ? "pass" : `FAIL — expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`}`;
    })
    .join("\n");
  return `TEST RESULTS (ground truth): ${outcome.passed}/${outcome.total} passed\n${lines}`;
}

export async function judgeSolution(
  input: JudgeInput,
  opts: { apiKey: string; model?: string },
): Promise<CodeVerdict> {
  const body = `PROBLEM: ${input.problem.title} (${input.problem.difficulty}, ${input.problem.topic})
${input.problem.statement}

Intended optimal complexity: ${input.problem.optimalComplexity}
Edge cases a strong candidate should raise: ${input.problem.edgeCases.join("; ")}

=== WHAT THEY SAID BEFORE CODING ===
${input.discussionTranscript || "(no discussion recorded)"}

=== SOLUTION (${input.language}) ===
${input.source}

=== ${renderOutcome(input.outcome)}`;

  return geminiGenerateJson<CodeVerdict>(
    {
      apiKey: opts.apiKey,
      model: opts.model ?? REASONING_MODEL,
      fallbackModels: REASONING_FALLBACKS,
      responseSchema: VERDICT_SCHEMA as unknown as object,
      temperature: 0.2,
    },
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: body },
    ],
  );
}
