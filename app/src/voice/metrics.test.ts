import { describe, it, expect, vi, afterEach } from "vitest";
import { LatencyTracker } from "./metrics";

/**
 * The latency gate decides whether the product feels human, so the tracker
 * that measures it has to be right — a tracker that silently under-reports
 * would hide the one failure mode we care most about.
 */

function atTime<T>(ms: number, fn: () => T): T {
  vi.spyOn(performance, "now").mockReturnValue(ms);
  return fn();
}

afterEach(() => vi.restoreAllMocks());

describe("LatencyTracker", () => {
  it("measures end-of-user-speech to first model audio", () => {
    const t = new LatencyTracker();
    atTime(1000, () => t.markUserSpeech());
    const sample = atTime(1544, () => t.markModelAudio());
    expect(sample).toEqual({ turn: 1, firstAudioMs: 544 });
  });

  it("counts only the first audio chunk of a turn", () => {
    const t = new LatencyTracker();
    atTime(1000, () => t.markUserSpeech());
    atTime(1500, () => t.markModelAudio());
    // Subsequent chunks of the same reply must not register as new turns.
    const second = atTime(1600, () => t.markModelAudio());
    expect(second).toBeNull();
    expect(t.summary().count).toBe(1);
  });

  it("uses the latest speech fragment as end-of-speech", () => {
    const t = new LatencyTracker();
    atTime(1000, () => t.markUserSpeech());
    atTime(2000, () => t.markUserSpeech()); // still talking
    const sample = atTime(2300, () => t.markModelAudio());
    expect(sample?.firstAudioMs).toBe(300);
  });

  it("ignores model audio that follows no user speech", () => {
    const t = new LatencyTracker();
    // e.g. the interviewer's opening greeting — nothing to measure against.
    expect(atTime(500, () => t.markModelAudio())).toBeNull();
  });

  it("does not attribute the next turn's audio to a finished turn", () => {
    const t = new LatencyTracker();
    atTime(1000, () => t.markUserSpeech());
    atTime(1500, () => t.markModelAudio());
    atTime(1900, () => t.endTurn());
    expect(atTime(2000, () => t.markModelAudio())).toBeNull();
  });

  it("reports p50 and p95 over the session", () => {
    const t = new LatencyTracker();
    for (const [start, first] of [[0, 100], [1000, 1200], [2000, 2300], [3000, 3400]] as const) {
      atTime(start, () => t.markUserSpeech());
      atTime(first, () => t.markModelAudio());
      t.endTurn();
    }
    // samples: 100, 200, 300, 400
    expect(t.summary()).toEqual({ count: 4, p50: 200, p95: 400 });
  });

  it("returns null percentiles before any turns", () => {
    expect(new LatencyTracker().summary()).toEqual({ count: 0, p50: null, p95: null });
  });
});
