/**
 * Interview engine core types.
 *
 * The engine models the interview the way a senior interviewer runs it:
 * an explicit stage machine plus a Socratic depth controller that decides,
 * after every candidate answer, whether to drill deeper, probe gently, or
 * move on.
 */

export type StageId =
  | "intro" // tell me about yourself
  | "resume" // resume discussion
  | "projects" // deep dive into projects
  | "technical" // technical / DSA questions
  | "behavioral"
  | "wrapup";

export interface StageDefinition {
  id: StageId;
  /** What the interviewer is trying to LEARN in this stage. */
  objective: string;
  /** Soft time budget in minutes; exit when learned enough or budget spent. */
  targetMinutes: number;
}

/** Assessment of a single candidate answer, produced by the reasoning model. */
export type AnswerQuality = "strong" | "adequate" | "shallow" | "evasive" | "wrong";

export interface AnswerAssessment {
  quality: AnswerQuality;
  /** One-line rationale, feeds the candidate model and the report. */
  note: string;
  /** Follow-up angle if we drill deeper (why-this, what-failed, trade-offs...). */
  suggestedProbe?: string;
}

/**
 * A Thread is one drill-down line of questioning ("Russian Doll"):
 * a topic, how deep we got, and how the candidate held up at each layer.
 * Threads are the raw material of the final report.
 */
export interface Thread {
  id: string;
  stage: StageId;
  topic: string; // e.g. "RAG pipeline project — vector store choice"
  depth: number; // layers of "why/how" reached
  assessments: AnswerAssessment[];
  exhausted: boolean; // candidate reached the limit of their understanding
}

/**
 * The candidate model: a running structured summary of what the interview
 * has revealed so far. Injected into the interviewer's context every turn
 * so later stages reference earlier answers naturally.
 */
export interface CandidateModel {
  claims: string[]; // things the candidate asserted
  verifiedStrengths: string[];
  exposedGaps: string[];
  communicationNotes: string[];
}

/**
 * The target role. Technical questions adapt to this — an ML Engineer
 * interview probes different fundamentals than a backend SWE one.
 */
export interface JobTarget {
  /** e.g. "ML Engineer", "Backend SWE", "Data Scientist" */
  role: string;
  seniority: "intern" | "junior" | "mid" | "senior" | "staff";
  /** Raw pasted job description, if provided. */
  jobDescription?: string;
  /** Extracted by the reasoning model from the JD: skills/areas to probe. */
  extractedRequirements?: string[];
}

export interface SessionConfig {
  resumeId: string;
  jobTarget: JobTarget;
  /** Provider/model doing the realtime interviewing. */
  conversation: { providerId: string; model: string };
  /** Provider/model for fast text calls: assessment, candidate model, report. */
  reasoning: { providerId: string; model: string };
  stages: StageDefinition[];
  /** Max drill-down layers per thread before surfacing. */
  maxDepthPerThread: number;
}
