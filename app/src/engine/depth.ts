import type { AnswerAssessment, Thread } from "./types";

/**
 * The Socratic depth controller — the product's differentiator, as code.
 *
 * Deliberately a pure function rather than a prompt: "keep drilling until
 * the candidate hits their limit" is the one behaviour we cannot let drift,
 * and prompts drift. This way it is testable, tunable, and identical every
 * session.
 *
 * The rule a good interviewer follows:
 *   strong answer      → go deeper, they can take it
 *   adequate           → one more layer, it may reveal more
 *   shallow/evasive    → probe ONCE more gently, then let it go
 *   wrong / at limit   → stop; grinding someone down teaches nothing
 *   depth budget spent → surface, there are other things to cover
 */

export type Move =
  /** Pull the next layer on this thread. */
  | { kind: "drill"; probe?: string }
  /** They're struggling — one gentle re-ask, not a harder one. */
  | { kind: "probe-gently"; probe?: string }
  /** Thread is done; pick a new topic within the stage. */
  | { kind: "next-topic"; reason: string }
  /** Stage objective met or budget spent. */
  | { kind: "next-stage"; reason: string };

export interface DepthContext {
  thread: Thread;
  assessment: AnswerAssessment & { atKnowledgeLimit: boolean };
  maxDepthPerThread: number;
  /** Topics still worth covering in this stage. */
  topicsRemaining: number;
  /** True once the stage's time budget is spent. */
  stageBudgetSpent: boolean;
}

export function decideNextMove(ctx: DepthContext): Move {
  const { thread, assessment, maxDepthPerThread, topicsRemaining, stageBudgetSpent } = ctx;

  // The candidate has hit the edge of what they know. A real interviewer
  // recognises this and eases off — further drilling only produces guessing
  // and anxiety, and yields no new signal for the report.
  if (assessment.atKnowledgeLimit) {
    return stageBudgetSpent || topicsRemaining === 0
      ? { kind: "next-stage", reason: "knowledge limit reached; stage exhausted" }
      : { kind: "next-topic", reason: "knowledge limit reached on this thread" };
  }

  // A wrong answer isn't a cue to pile on. Note it and move.
  if (assessment.quality === "wrong") {
    return stageBudgetSpent || topicsRemaining === 0
      ? { kind: "next-stage", reason: "incorrect answer; stage exhausted" }
      : { kind: "next-topic", reason: "incorrect answer; no value in drilling further" };
  }

  // Struggling: allow exactly one gentle re-ask per thread, then let go.
  // Two consecutive weak answers means the topic isn't landing — pressing a
  // third time is the behaviour candidates describe as a bad interview.
  if (assessment.quality === "shallow" || assessment.quality === "evasive") {
    const alreadyProbedGently = thread.assessments
      .slice(-1)
      .some((a) => a.quality === "shallow" || a.quality === "evasive");
    if (alreadyProbedGently) {
      return topicsRemaining > 0 && !stageBudgetSpent
        ? { kind: "next-topic", reason: "two weak answers; topic isn't landing" }
        : { kind: "next-stage", reason: "two weak answers; stage exhausted" };
    }
    return { kind: "probe-gently", probe: assessment.suggestedProbe };
  }

  // Answering well — but every thread has a floor. Depth is the point, yet
  // an hour has other stages in it.
  if (thread.depth >= maxDepthPerThread) {
    return topicsRemaining > 0 && !stageBudgetSpent
      ? { kind: "next-topic", reason: "depth budget reached on this thread" }
      : { kind: "next-stage", reason: "depth budget reached; stage exhausted" };
  }

  if (stageBudgetSpent) {
    return { kind: "next-stage", reason: "stage time budget spent" };
  }

  return { kind: "drill", probe: assessment.suggestedProbe };
}
