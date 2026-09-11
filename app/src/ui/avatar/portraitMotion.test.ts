import { describe, it, expect } from "vitest";
import { createPortraitMotion, stepPortraitMotion } from "./portraitMotion";

describe("local photographic mouth and expressions", () => {
  it("keeps the expanded rig bounded through a simulated thirty-minute interview", () => {
    let state = createPortraitMotion(() => .3);
    let speechBlink = false;
    for (let i = 0; i < 30 * 60 * 30; i++) {
      const level = i % 450 < 220 ? Math.max(0, Math.sin(i * .31)) * .24 : 0;
      state = stepPortraitMotion(state, level, 1 / 30, false, () => .3);
      for (const key of ["mouth", "transition", "recovery"] as const) {
        if (!Number.isFinite(state[key]) || state[key] < 0 || state[key] > 1) throw new Error(key);
      }
      if (state.mouth === 0) expect(state.recovery).toBeLessThan(.025);
      speechBlink ||= state.mouth > .1 && state.blink.closed > .3;
    }
    expect(speechBlink).toBe(true);
  });
  it("stops new decorative motion immediately when reduced motion is enabled", () => {
    const state = stepPortraitMotion({ ...createPortraitMotion(), gaze: .5, breath: .3 }, .2, 1 / 30, true);
    expect(state.gaze).toBe(0);
    expect(state.breath).toBe(0);
    expect(state.mouth).toBeGreaterThan(0);
  });
  it("opens with audible speech and closes promptly after an interruption", () => {
    let state = createPortraitMotion(() => .5);
    for (let i = 0; i < 10; i++) state = stepPortraitMotion(state, .2, 1 / 30);
    expect(state.mouth).toBeGreaterThan(.7);
    for (let i = 0; i < 5; i++) state = stepPortraitMotion(state, 0, 1 / 30);
    expect(state.mouth).toBe(0);
  });
  it("keeps the mouth closed in silence while blinks and expressions progress", () => {
    let state = createPortraitMotion(() => 0);
    let blinked = false;
    for (let i = 0; i < 180; i++) {
      state = stepPortraitMotion(state, 0, 1 / 30, false, () => 0);
      expect(state.mouth).toBe(0);
      blinked ||= state.blink.closed > .5;
    }
    expect(blinked).toBe(true);
    expect(state.warmth).toBeGreaterThan(.35);
  });
  it("retains speech movement with decorative animation reduced", () => {
    let state = createPortraitMotion(() => 0);
    for (let i = 0; i < 150; i++) state = stepPortraitMotion(state, .18, 1 / 30, true);
    expect(state.blink.closed).toBe(0);
    expect(state.warmth).toBeLessThan(.01);
    expect(state.mouth).toBeGreaterThan(.6);
  });
  it("rejects invalid audio values without corrupting the animation", () => {
    for (const level of [NaN, Infinity, -1]) {
      expect(stepPortraitMotion(createPortraitMotion(), level, 1 / 30).mouth).toBe(0);
    }
  });
  it("blends a rounded opening for softer speech and a wide opening for louder speech", () => {
    let soft = createPortraitMotion();
    let loud = createPortraitMotion();
    for (let i = 0; i < 30; i++) {
      soft = stepPortraitMotion(soft, .08, 1 / 30);
      loud = stepPortraitMotion(loud, .28, 1 / 30);
    }
    expect(soft.rounded).toBeGreaterThan(.7);
    expect(loud.rounded).toBeLessThan(.05);
    for (let i = 0; i < 15; i++) soft = stepPortraitMotion(soft, 0, 1 / 30);
    expect(soft.mouth).toBe(0);
    expect(soft.rounded).toBeLessThan(.01);
  });
  it("suppresses attentive expression with reduced motion", () => {
    let state = createPortraitMotion();
    for (let i = 0; i < 120; i++) state = stepPortraitMotion(state, 0, 1 / 30);
    expect(state.attentive).toBeGreaterThan(.2);
    for (let i = 0; i < 120; i++) state = stepPortraitMotion(state, 0, 1 / 30, true);
    expect(state.attentive).toBeLessThan(.01);
  });
});
