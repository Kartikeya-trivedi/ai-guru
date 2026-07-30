import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the orchestration loop — the bugs here are the worst-bug class
 * (telling a candidate something false), and none were covered before.
 *
 * The live channel, mic, and playback are mocked; assessAnswer is a spy. We
 * drive a scripted event stream and assert on what the engine paired and how
 * it steered.
 */

const h = vi.hoisted(() => ({
  updateContext: vi.fn(),
  assess: vi.fn(),
  openGeminiLive: vi.fn(),
}));

vi.mock("../providers/gemini/live", () => ({
  LIVE_MODEL: "test-model",
  GEMINI_INPUT_SAMPLE_RATE: 16000,
  openGeminiLive: h.openGeminiLive,
}));
vi.mock("../voice/capture", () => ({
  startMicCapture: vi.fn(async () => ({ level: () => 0, stop: vi.fn() })),
}));
vi.mock("../voice/playback", () => ({
  createAudioSink: vi.fn(() => ({ enqueue: vi.fn(), flush: vi.fn(), isPlaying: () => false, close: vi.fn() })),
}));
vi.mock("./assess", () => ({ assessAnswer: h.assess }));

import { InterviewSession, type SessionCallbacks } from "./session";
import type { ParsedResume } from "../resume/types";

type Ev =
  | { type: "transcript"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "turn-complete" }
  | { type: "audio"; frame: ArrayBuffer; sampleRate: number }
  | { type: "interrupted" }
  | { type: "error"; message: string };

/** A channel whose event stream is a fixed script that then ends. */
function fakeChannel(script: Ev[]) {
  return {
    sendAudio: vi.fn(),
    updateContext: h.updateContext,
    close: vi.fn(),
    events: async function* () {
      for (const ev of script) {
        // Yield to the microtask queue between events so fire-and-forget
        // assessment work can interleave, as it does in production.
        await Promise.resolve();
        yield ev;
      }
    },
  };
}

const flush = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const RESUME: ParsedResume = {
  name: "Test Candidate",
  summary: "",
  experience: [],
  projects: [{ name: "kllm", description: "inference engine", technologies: ["CUDA"], probeAngles: ["why paged KV"] }],
  skills: ["Python", "CUDA"],
  education: [],
};

function callbacks(): SessionCallbacks {
  return {
    onTranscript: vi.fn(),
    onStageChange: vi.fn(),
    onThreadUpdate: vi.fn(),
    onLatency: vi.fn(),
    onError: vi.fn(),
    onNotice: vi.fn(),
    onStatus: vi.fn(),
    onTurnComplete: vi.fn(),
  };
}

/** One gradeable exchange = greeting turn, then answer + follow-up turn. */
function oneExchange(q1: string, a1: string, q2: string): Ev[] {
  return [
    { type: "transcript", role: "assistant", text: q1, final: true },
    { type: "turn-complete" },
    { type: "transcript", role: "user", text: a1, final: true },
    { type: "transcript", role: "assistant", text: q2, final: true },
    { type: "turn-complete" },
  ];
}

beforeEach(() => {
  h.updateContext.mockReset();
  h.assess.mockReset();
  h.openGeminiLive.mockReset();
});

describe("InterviewSession Q/A pairing", () => {
  it("grades an answer against the question it actually answered, not the follow-up", async () => {
    // The off-by-one bug: within one turn-complete window the buffers hold
    // [answer to Q1] + [the follow-up Q2]. Grading (Q2, A1) would call a
    // technical answer 'evasive' for dodging a question never asked.
    h.assess.mockResolvedValue({ quality: "strong", note: "solid", atKnowledgeLimit: false });
    h.openGeminiLive.mockResolvedValue(
      fakeChannel(oneExchange("Why paged KV over contiguous?", "It avoids padding waste and lifts batch size.", "What did you give up?")),
    );

    const session = new InterviewSession({ apiKey: "k", resume: RESUME, jobTarget: { role: "AI Engineer", seniority: "mid" } }, callbacks());
    await session.start();
    await flush();

    expect(h.assess).toHaveBeenCalledTimes(1);
    expect(h.assess).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Why paged KV over contiguous?",
        answer: "It avoids padding waste and lifts batch size.",
      }),
      expect.anything(),
    );
  });

  it("discards nothing when assessments run long — every answer is still graded", async () => {
    // The dropped-exchange bug: a slow assessment used to make the next
    // exchange return early with its buffers already cleared, deleting a real
    // person's answer from the report.
    let resolveFirst!: (v: unknown) => void;
    const firstPending = new Promise((r) => (resolveFirst = r));
    h.assess
      .mockImplementationOnce(() => firstPending)
      .mockResolvedValue({ quality: "adequate", note: "ok", atKnowledgeLimit: false });

    const script = [
      ...oneExchange("Q1?", "A1", "Q2?"),
      { type: "transcript", role: "user", text: "A2", final: true } as Ev,
      { type: "transcript", role: "assistant", text: "Q3?", final: true } as Ev,
      { type: "turn-complete" } as Ev,
    ];
    h.openGeminiLive.mockResolvedValue(fakeChannel(script));

    const session = new InterviewSession({ apiKey: "k", resume: RESUME, jobTarget: { role: "AI Engineer", seniority: "mid" } }, callbacks());
    await session.start();
    await flush();

    // First assessment is still pending, so only it has started.
    expect(h.assess).toHaveBeenCalledTimes(1);
    resolveFirst({ quality: "adequate", note: "ok", atKnowledgeLimit: false });
    await flush();

    // The second exchange was queued, not dropped.
    expect(h.assess).toHaveBeenCalledTimes(2);
    expect(h.assess).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Q2?", answer: "A2" }), expect.anything());
  });
});

describe("InterviewSession empathy: gentle re-probe", () => {
  it("gives one gentle re-ask on a first thin answer instead of moving on", async () => {
    // Regression for the dead probe-gently branch: session used to record the
    // assessment before deciding, making depth.ts think it had already
    // re-probed, so a struggling candidate was silently dropped.
    h.assess.mockResolvedValue({ quality: "shallow", note: "vague on eviction policy", atKnowledgeLimit: false, suggestedProbe: "Which part specifically?" });
    h.openGeminiLive.mockResolvedValue(fakeChannel(oneExchange("Tell me about kllm.", "It's a fast inference engine.", "Go on.")));

    const session = new InterviewSession({ apiKey: "k", resume: RESUME, jobTarget: { role: "AI Engineer", seniority: "mid" } }, callbacks());
    await session.start();
    await flush();

    const steers = h.updateContext.mock.calls.map((c) => String(c[0])).join("\n");
    expect(steers).toMatch(/gentler|fair chance/i);
  });
});
