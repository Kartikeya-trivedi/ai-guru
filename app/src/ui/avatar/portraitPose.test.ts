import { describe, expect, it } from "vitest";
import { createPortraitMotion, stepPortraitMotion } from "./portraitMotion";
import { mouthWeights } from "./portraitPose";

describe("multi-frame articulation", () => {
  it("keeps mixtures normalized across speech, pauses and invalid input", () => {
    let state = createPortraitMotion(() => .2);
    for (let i = 0; i < 600; i++) {
      const level = i % 19 === 0 ? NaN : Math.max(0, Math.sin(i * .37) * .3);
      state = stepPortraitMotion(state, level, 1 / 30);
      const weights = mouthWeights(state);
      expect(weights.every(x => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
      expect(weights.reduce((sum, x) => sum + x, 0)).toBeCloseTo(1, 8);
    }
  });
  it("uses a closed-lip pose after speech stops", () => {
    let state = createPortraitMotion();
    for (let i = 0; i < 20; i++) state = stepPortraitMotion(state, .25, 1 / 30);
    for (let i = 0; i < 6; i++) state = stepPortraitMotion(state, 0, 1 / 30);
    expect(state.mouth).toBe(0);
    expect(mouthWeights(state)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    for (let i = 0; i < 30; i++) state = stepPortraitMotion(state, 0, 1 / 30);
    expect(state.closure).toBeLessThan(.001);
  });
  it("does not cycle syllable styles on a continuous tone", () => {
    let state = createPortraitMotion();
    for (let i = 0; i < 300; i++) state = stepPortraitMotion(state, .2, 1 / 30);
    expect(state.syllable).toBe(1);
  });
  it("suppresses the new decorative expressions under reduced motion", () => {
    let state = { ...createPortraitMotion(), focused: .7, smile: .6 };
    for (let i = 0; i < 240; i++) state = stepPortraitMotion(state, 0, 1 / 30, true);
    expect(state.focused).toBeLessThan(.001);
    expect(state.smile).toBeLessThan(.001);
  });
});
