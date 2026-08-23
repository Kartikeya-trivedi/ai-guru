import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Failing over to the Groq pipeline when a Gemini key runs out of quota.
 *
 * This is the path nobody exercises by hand, because reproducing it means
 * deliberately burning a paid key mid-interview. It is also the path where a
 * bug costs a real person an hour of their time and their report — so the
 * decision to degrade, and the decision NOT to, are both pinned here.
 */

const h = vi.hoisted(() => ({
  openGeminiLive: vi.fn(),
  openGroqVoice: vi.fn(),
  getKey: vi.fn(),
}));

vi.mock("../providers/gemini/live", () => ({
  LIVE_MODEL: "test-model",
  GEMINI_INPUT_SAMPLE_RATE: 16000,
  openGeminiLive: h.openGeminiLive,
}));
vi.mock("../providers/groq/voice", () => ({ openGroqVoice: h.openGroqVoice }));
vi.mock("../providers/keys", () => ({ getKey: h.getKey }));
vi.mock("../voice/capture", () => ({
  startMicCapture: vi.fn(async () => ({ level: () => 0, stop: vi.fn() })),
}));
vi.mock("../voice/playback", () => ({
  createAudioSink: vi.fn(() => ({
    enqueue: vi.fn(),
    flush: vi.fn(),
    isPlaying: () => false,
    level: () => 0,
    close: vi.fn(),
  })),
}));
vi.mock("./assess", () => ({ assessAnswer: vi.fn() }));
vi.mock("../video/capture", () => ({
  startCameraCapture: vi.fn(),
  startScreenCapture: vi.fn(),
}));

import { InterviewSession, type SessionCallbacks } from "./session";
import type { ParsedResume } from "../resume/types";
import type { VoiceEvent } from "../providers/types";

const RESUME: ParsedResume = {
  name: "Test Candidate",
  summary: "",
  experience: [],
  projects: [{ name: "kllm", description: "engine", technologies: ["CUDA"], probeAngles: [] }],
  skills: ["CUDA"],
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

/** A channel that emits a scripted stream then ends, like a dropped socket. */
function channel(script: VoiceEvent[]) {
  return {
    sendAudio: vi.fn(),
    updateContext: vi.fn(),
    close: vi.fn(),
    events: async function* () {
      for (const ev of script) {
        await Promise.resolve();
        yield ev;
      }
    },
  };
}

/** A live channel that never ends, standing in for the replacement. */
function idleChannel() {
  return {
    sendAudio: vi.fn(),
    updateContext: vi.fn(),
    close: vi.fn(),
    events: async function* () {
      await new Promise(() => {});
    },
  };
}

const flush = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const QUOTA = "connection lost (1011 RESOURCE_EXHAUSTED: quota exceeded)";

beforeEach(() => {
  h.openGeminiLive.mockReset();
  h.openGroqVoice.mockReset();
  h.getKey.mockReset();
});

async function run(script: VoiceEvent[], cb = callbacks()) {
  h.openGeminiLive.mockResolvedValue(channel(script));
  const session = new InterviewSession(
    { apiKey: "gemini-key", resume: RESUME, jobTarget: { role: "AI Engineer", seniority: "mid" } },
    cb,
  );
  await session.start();
  await flush();
  return { session, cb };
}

describe("quota failover", () => {
  it("keeps the interview alive on a backup voice instead of ending it", async () => {
    h.getKey.mockResolvedValue("groq-key");
    h.openGroqVoice.mockResolvedValue(idleChannel());

    const { cb } = await run([{ type: "error", message: QUOTA }]);

    expect(h.openGroqVoice).toHaveBeenCalledTimes(1);
    // The candidate must not be told the interview died when it did not.
    expect(cb.onStatus).not.toHaveBeenCalledWith("disconnected");
    const statuses = vi.mocked(cb.onStatus).mock.calls.map((c) => c[0]);
    expect(statuses[statuses.length - 1]).toBe("live");
    // But they must be told what changed — a voice swapping mid-sentence
    // with no explanation reads as a malfunction.
    expect(vi.mocked(cb.onNotice).mock.calls.map((c) => String(c[0])).join(" ")).toMatch(
      /quota|backup voice/i,
    );
  });

  it("hands the replacement the conversation so far, so it resumes rather than restarts", async () => {
    h.getKey.mockResolvedValue("groq-key");
    h.openGroqVoice.mockResolvedValue(idleChannel());

    await run([
      { type: "transcript", role: "assistant", text: "Tell me about kllm.", final: true },
      { type: "turn-complete" },
      { type: "transcript", role: "user", text: "It is an inference engine.", final: true },
      { type: "transcript", role: "assistant", text: "Why paged KV?", final: true },
      { type: "turn-complete" },
      { type: "error", message: QUOTA },
    ]);

    const opts = h.openGroqVoice.mock.calls[0][0];
    expect(opts.history).toEqual(
      expect.arrayContaining([{ role: "user", content: "It is an inference engine." }]),
    );
    // Without this the fallback greets someone it has been talking to for
    // twenty minutes.
    expect(opts.systemInstruction).toMatch(/resuming an interview already in progress/i);
  });

  it("does NOT degrade someone because their wifi blinked", async () => {
    // A generic drop is usually transient. Silently downgrading to a slower
    // interviewer would be the wrong trade, and would hide a real problem.
    h.getKey.mockResolvedValue("groq-key");
    h.openGroqVoice.mockResolvedValue(idleChannel());

    const { cb } = await run([{ type: "error", message: "connection lost (1006)" }]);

    expect(h.openGroqVoice).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalled();
    expect(cb.onStatus).toHaveBeenCalledWith("disconnected");
  });

  it("says plainly what happened when there is no Groq key to fall back to", async () => {
    h.getKey.mockResolvedValue(null);

    const { cb } = await run([{ type: "error", message: QUOTA }]);

    expect(cb.onStatus).toHaveBeenCalledWith("disconnected");
    const said = vi.mocked(cb.onError).mock.calls.map((c) => String(c[0])).join(" ");
    expect(said).toMatch(/out of quota/i);
    // Tell them how to avoid it next time rather than just failing.
    expect(said).toMatch(/Groq API key/i);
  });

  it("does not fail over twice — there is nothing left to try", async () => {
    h.getKey.mockResolvedValue("groq-key");
    // The replacement itself dies with a quota error too.
    h.openGroqVoice.mockResolvedValue(channel([{ type: "error", message: QUOTA }]));

    const { cb } = await run([{ type: "error", message: QUOTA }]);

    expect(h.openGroqVoice).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalled();
  });
});
