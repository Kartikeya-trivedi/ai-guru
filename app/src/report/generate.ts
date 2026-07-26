import { geminiGenerateJson } from "../providers/gemini/text";
import { REASONING_MODEL, REASONING_FALLBACKS } from "../providers/gemini/models";
import type { CandidateModel, JobTarget, Thread } from "../engine/types";
import type { InterviewReport } from "./types";

/**
 * Report generation.
 *
 * Runs after the interview, so it can afford the slower, better model —
 * this is the artifact the customer keeps and acts on, and the only part
 * they re-read. Quality matters more than latency here.
 *
 * It is grounded in Threads (topic x depth x per-answer quality), not just
 * the transcript: depth reached is the evidence that separates "knows the
 * buzzword" from "understands it".
 */

const DIMENSION = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: 5 },
    justification: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
  },
  required: ["score", "justification", "evidence"],
};

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    projectDepth: DIMENSION,
    technicalKnowledge: DIMENSION,
    behavioralFit: DIMENSION,
    communication: DIMENSION,
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    interviewReadiness: { type: "string" },
    actionableImprovements: { type: "array", items: { type: "string" } },
  },
  required: [
    "projectDepth",
    "technicalKnowledge",
    "behavioralFit",
    "communication",
    "strengths",
    "weaknesses",
    "interviewReadiness",
    "actionableImprovements",
  ],
} as const;

const SYSTEM = `You are a senior interviewer writing up your evaluation immediately after the interview. A real person will read this and act on it.

GROUND EVERYTHING IN EVIDENCE. Every score needs justification tied to what actually happened. In "evidence", quote or closely paraphrase specific moments. Never invent a moment that isn't in the material.

HOW TO READ THE THREADS. Each thread is one line of questioning with a depth (how many layers of "why/how" they withstood) and a per-answer quality trail. Depth is the strongest signal you have:
- deep thread, quality holding → genuine understanding, not memorisation
- shallow thread that collapsed after one layer → surface knowledge
- "atKnowledgeLimit" reached early on a topic they CLAIM as a skill → the gap that matters most

SCORING (1-5). Be honest and calibrated to the target seniority. A 3 is a solid, hireable-with-reservations answer set, not a failure. Do not inflate: a report that tells everyone they're great is worthless and the candidate paid for the truth. Equally, do not manufacture harshness — if they were strong, say so plainly.

TONE. Direct, specific, and humane. Write to the candidate as a respected peer ("you"), not about them. No corporate hedging, no motivational filler. They can handle the truth if it's specific and actionable.

Honesty about a knowledge limit is a STRENGTH, not a weakness — engineers who know their edges are safer than those who bluff. Only count it against them if they bluffed first and folded when pushed.

interviewReadiness: a clear verdict in one or two sentences, e.g. "Ready for mid-level AI Engineer interviews at product companies; the systems-design gap would show at senior level."

actionableImprovements: 3-5 items each naming a SPECIFIC next action, e.g. "Re-derive why paged attention beats contiguous KV from memory-utilisation first principles — you reached for 'vLLM does it' when pushed." Not "study more system design".`;

export interface ReportInput {
  sessionId: string;
  candidateName: string;
  jobTarget: JobTarget;
  threads: Thread[];
  candidateModel: CandidateModel;
  transcript: { role: "user" | "assistant"; text: string }[];
}

function renderThreads(threads: Thread[]): string {
  if (!threads.length) return "(no threads recorded)";
  return threads
    .map((t) => {
      const trail = t.assessments
        .map((a, i) => `      layer ${i + 1}: ${a.quality} — ${a.note}`)
        .join("\n");
      return `  [${t.stage}] ${t.topic}\n    depth reached: ${t.depth}${t.exhausted ? " (hit knowledge limit)" : ""}\n${trail}`;
    })
    .join("\n\n");
}

function renderTranscript(transcript: ReportInput["transcript"]): string {
  // Cap the transcript: threads carry the judgement, the transcript only
  // supplies voice and quotable moments. A full hour would bloat the call
  // for little added signal.
  const text = transcript
    .map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.text}`)
    .join("\n");
  const LIMIT = 24000;
  return text.length <= LIMIT ? text : `…(earlier conversation trimmed)…\n${text.slice(-LIMIT)}`;
}

export async function generateReport(
  input: ReportInput,
  opts: { apiKey: string; model?: string },
): Promise<InterviewReport> {
  const body = `TARGET ROLE: ${input.jobTarget.seniority}-level ${input.jobTarget.role}
CANDIDATE: ${input.candidateName}

=== THREADS (lines of questioning, with depth and per-answer quality) ===
${renderThreads(input.threads)}

=== WHAT THE INTERVIEW REVEALED ===
Verified strengths: ${input.candidateModel.verifiedStrengths.join("; ") || "(none recorded)"}
Exposed gaps: ${input.candidateModel.exposedGaps.join("; ") || "(none recorded)"}
Other notes: ${input.candidateModel.claims.join("; ") || "(none)"}

=== TRANSCRIPT ===
${renderTranscript(input.transcript)}`;

  const generated = await geminiGenerateJson<Omit<InterviewReport, "sessionId" | "createdAt">>(
    {
      apiKey: opts.apiKey,
      model: opts.model ?? REASONING_MODEL,
      fallbackModels: REASONING_FALLBACKS,
      responseSchema: REPORT_SCHEMA as unknown as object,
      temperature: 0.3,
    },
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: body },
    ],
  );

  return {
    ...generated,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
  };
}
