import { describe, it, expect } from "vitest";
import { createPortraitMotion, stepPortraitMotion } from "./portraitMotion";

describe("local photographic mouth and expressions", () => {
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
