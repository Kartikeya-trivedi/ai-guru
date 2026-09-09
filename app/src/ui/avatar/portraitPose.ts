import type { PortraitMotion } from "./portraitMotion";

export const PORTRAIT_FRAME_NAMES = ["portrait", "speaking", "blink", "warm", "rounded", "attentive",
  "parted", "half-blink", "spread", "open", "lip-bite", "pressed", "focused", "smile"] as const;
export type PortraitFrameName = typeof PORTRAIT_FRAME_NAMES[number];
export const MOUTH_NAMES = ["parted", "speaking", "rounded", "spread", "open", "lip-bite", "pressed"] as const;
const clamp = (x: number) => Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;

/** Artistic articulation from speech energy/onsets; these are not detected phonemes. */
export function mouthWeights(state: PortraitMotion): number[] {
  const m = clamp(state.mouth);
  if (m < .015) return [0, 0, 0, 0, 0, 0, 1];
  const open = clamp((m - .68) / .32);
  const round = clamp(state.rounded) * (1 - clamp(state.spread)) * .85;
  const spread = clamp(state.spread) * (1 - open) * .75;
  const contact = clamp(1 - Math.abs(m - .18) / .12) * .3;
  const weights = [Math.max(.05, 1 - m * 1.5), m * (1 - open), round, spread, open * 1.4, contact, 0];
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}
