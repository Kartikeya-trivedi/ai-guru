import { describe, it, expect } from "vitest";
import {
  breathe,
  createBlinkState,
  idleSway,
  opennessFromLevel,
  scheduleBlink,
  smoothOpenness,
  stepBlink,
  type BlinkState,
} from "./face";

/**
 * The face is judged by eye, but the maths behind it has failure modes that
 * are easy to ship and hard to spot in a screenshot: a mouth that never
 * opens during normal speech, a blink that fires like a metronome, motion
 * that runs at double speed on a 120Hz display.
 */

describe("opennessFromLevel", () => {
  it("stays shut on silence and room tone", () => {
    expect(opennessFromLevel(0)).toBe(0);
    expect(opennessFromLevel(0.01)).toBe(0);
  });

  it("opens meaningfully at conversational loudness", () => {
    // The bug this catches: a linear map leaves ordinary speech (~0.08 RMS)
    // barely moving the mouth, so the face looks like it is mumbling.
    expect(opennessFromLevel(0.08)).toBeGreaterThan(0.35);
  });

  it("saturates rather than overshooting on loud peaks", () => {
    expect(opennessFromLevel(0.9)).toBe(1);
    expect(opennessFromLevel(5)).toBe(1);
  });

  it("increases monotonically with loudness", () => {
    let prev = -1;
    for (const l of [0.02, 0.05, 0.1, 0.15, 0.2, 0.28]) {
      const o = opennessFromLevel(l);
      expect(o).toBeGreaterThan(prev);
      prev = o;
    }
  });

  it("survives NaN from a dead analyser instead of freezing the mouth open", () => {
    expect(opennessFromLevel(NaN)).toBe(0);
  });
});

describe("smoothOpenness", () => {
  it("opens faster than it closes", () => {
    const dt = 1 / 60;
    const opening = smoothOpenness(0, 1, dt);
    const closing = 1 - smoothOpenness(1, 0, dt);
    expect(opening).toBeGreaterThan(closing);
  });

  it("converges toward the target", () => {
    let v = 0;
    for (let i = 0; i < 30; i++) v = smoothOpenness(v, 1, 1 / 60);
    expect(v).toBeGreaterThan(0.95);
  });

  it("is frame-rate independent", () => {
    // Same elapsed time, different frame rates, must land in the same place —
    // otherwise the face animates at double speed on a 120Hz monitor.
    let at60 = 0;
    for (let i = 0; i < 12; i++) at60 = smoothOpenness(at60, 1, 1 / 60);
    let at120 = 0;
    for (let i = 0; i < 24; i++) at120 = smoothOpenness(at120, 1, 1 / 120);
    expect(Math.abs(at60 - at120)).toBeLessThan(0.02);
  });
});

describe("blinking", () => {
  it("schedules blinks in a human range, never on a fixed beat", () => {
    const gaps = Array.from({ length: 50 }, () => scheduleBlink());
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(2);
      expect(g).toBeLessThanOrEqual(6);
    }
    // A metronome blink is instantly uncanny; require actual variation.
    expect(new Set(gaps).size).toBeGreaterThan(40);
  });

  it("stays open until the timer elapses", () => {
    let s = createBlinkState(() => 0.5); // 4s until the first blink
    for (let i = 0; i < 60; i++) s = stepBlink(s, 1 / 60);
    expect(s.closed).toBe(0);
    expect(s.elapsed).toBeNull();
  });

  it("closes fully and reopens within a blink's duration", () => {
    // Mid-blink: elapsed is 0 rather than null, so the step function is
    // already inside the close/open curve.
    let s: BlinkState = { closed: 0, nextIn: 0, elapsed: 0 };
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      s = stepBlink(s, 0.014, () => 0.5);
      peak = Math.max(peak, s.closed);
    }
    expect(peak).toBeGreaterThan(0.9);

    // Run past the end: the eye must reopen and re-arm, not stay shut.
    for (let i = 0; i < 20; i++) s = stepBlink(s, 0.014, () => 0.5);
    expect(s.closed).toBe(0);
    expect(s.elapsed).toBeNull();
    expect(s.nextIn).toBeGreaterThan(0);
  });

  it("never leaves the lid outside 0..1", () => {
    let s = createBlinkState(() => 0);
    for (let i = 0; i < 2000; i++) {
      s = stepBlink(s, 0.02, () => 0.3);
      expect(s.closed).toBeGreaterThanOrEqual(0);
      expect(s.closed).toBeLessThanOrEqual(1);
    }
  });
});

describe("idle motion", () => {
  it("stays subtle — presence, not a bobbing toy", () => {
    for (let t = 0; t < 120; t += 0.25) {
      const s = idleSway(t);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(s.tilt)).toBeLessThanOrEqual(1);
      expect(Math.abs(breathe(t))).toBeLessThanOrEqual(1);
    }
  });

  it("does not visibly loop", () => {
    // Incommensurate periods: the same pose should not recur on a short cycle.
    const a = idleSway(10);
    const b = idleSway(10 + 2 * Math.PI);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(0.05);
  });
});
