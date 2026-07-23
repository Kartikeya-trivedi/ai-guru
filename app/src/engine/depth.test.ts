import { describe, it, expect } from "vitest";
import { decideNextMove, type DepthContext } from "./depth";
import type { AnswerAssessment, Thread } from "./types";

/**
 * These tests encode the interviewing *judgement* we promised, not just
 * branch coverage. If one fails, the product has started behaving like a
 * worse interviewer.
 */

function thread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    stage: "projects",
    topic: "kllm — paged-KV cache",
    depth: 1,
    assessments: [],
    exhausted: false,
    ...over,
  };
}

function assessment(
  over: Partial<AnswerAssessment & { atKnowledgeLimit: boolean }> = {},
): AnswerAssessment & { atKnowledgeLimit: boolean } {
  return { quality: "strong", note: "", atKnowledgeLimit: false, ...over };
}

function ctx(over: Partial<DepthContext> = {}): DepthContext {
  return {
    thread: thread(),
    assessment: assessment(),
    maxDepthPerThread: 5,
    topicsRemaining: 3,
    stageBudgetSpent: false,
    ...over,
  };
}

describe("depth controller", () => {
  it("drills deeper when the answer is strong", () => {
    const move = decideNextMove(ctx({ assessment: assessment({ quality: "strong", suggestedProbe: "Why not FIFO eviction?" }) }));
    expect(move).toEqual({ kind: "drill", probe: "Why not FIFO eviction?" });
  });

  it("drills on an adequate answer — one more layer may reveal more", () => {
    expect(decideNextMove(ctx({ assessment: assessment({ quality: "adequate" }) })).kind).toBe("drill");
  });

  it("stops drilling at the candidate's knowledge limit", () => {
    // The core empathy rule: past this point drilling only produces guessing.
    const move = decideNextMove(ctx({ assessment: assessment({ quality: "strong", atKnowledgeLimit: true }) }));
    expect(move.kind).toBe("next-topic");
  });

  it("does not pile on after a wrong answer", () => {
    expect(decideNextMove(ctx({ assessment: assessment({ quality: "wrong" }) })).kind).toBe("next-topic");
  });

  it("probes gently on a first shallow answer", () => {
    const move = decideNextMove(ctx({ assessment: assessment({ quality: "shallow", suggestedProbe: "Which part specifically?" }) }));
    expect(move).toEqual({ kind: "probe-gently", probe: "Which part specifically?" });
  });

  it("lets go after two consecutive weak answers", () => {
    // Pressing a third time is what candidates call a bad interview.
    const move = decideNextMove(
      ctx({
        thread: thread({ assessments: [assessment({ quality: "shallow" })] }),
        assessment: assessment({ quality: "evasive" }),
      }),
    );
    expect(move.kind).toBe("next-topic");
  });

  it("treats an earlier weak answer as forgiven if the last was strong", () => {
    // Only the immediately preceding answer counts — a candidate who
    // recovers shouldn't be punished for a stumble three layers ago.
    const move = decideNextMove(
      ctx({
        thread: thread({ assessments: [assessment({ quality: "shallow" }), assessment({ quality: "strong" })] }),
        assessment: assessment({ quality: "shallow" }),
      }),
    );
    expect(move.kind).toBe("probe-gently");
  });

  it("surfaces when the depth budget is spent even on strong answers", () => {
    const move = decideNextMove(ctx({ thread: thread({ depth: 5 }), maxDepthPerThread: 5 }));
    expect(move.kind).toBe("next-topic");
  });

  it("advances the stage when depth is spent and no topics remain", () => {
    const move = decideNextMove(ctx({ thread: thread({ depth: 5 }), maxDepthPerThread: 5, topicsRemaining: 0 }));
    expect(move.kind).toBe("next-stage");
  });

  it("advances the stage when the time budget is spent", () => {
    expect(decideNextMove(ctx({ stageBudgetSpent: true })).kind).toBe("next-stage");
  });

  it("advances the stage at the knowledge limit when the stage is exhausted", () => {
    const move = decideNextMove(ctx({ assessment: assessment({ atKnowledgeLimit: true }), topicsRemaining: 0 }));
    expect(move.kind).toBe("next-stage");
  });

  it("never drills past the budget regardless of quality", () => {
    for (const quality of ["strong", "adequate"] as const) {
      const move = decideNextMove(ctx({ assessment: assessment({ quality }), thread: thread({ depth: 99 }) }));
      expect(move.kind).not.toBe("drill");
    }
  });
});
