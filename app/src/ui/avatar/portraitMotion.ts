import { createBlinkState, opennessFromLevel, stepBlink, type BlinkState } from "./face";

export interface PortraitMotion {
  mouth: number; rounded: number; attentive: number; warmth: number; blink: BlinkState; elapsed: number;
  focused: number; smile: number; closure: number; spread: number; syllable: number; sinceOnset: number;
}
export function createPortraitMotion(random = Math.random): PortraitMotion {
  return { mouth: 0, rounded: 0, attentive: 0, warmth: 0.35, blink: createBlinkState(random), elapsed: 0,
    focused: 0, smile: 0, closure: 0, spread: 0, syllable: 0, sinceOnset: 1 };
}
/** Sound, not the transcript's speaking flag, is authoritative for the mouth. */
export function stepPortraitMotion(previous: PortraitMotion, level: number, dt: number,
  reducedMotion = false, random = Math.random): PortraitMotion {
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.08, dt)) : 0;
  const target = opennessFromLevel(level);
  const elapsed = previous.elapsed + step;
  const tau = target > previous.mouth ? 0.04 : 0.035;
  const mouth = previous.mouth + (target - previous.mouth) * (1 - Math.exp(-step / tau));
  const warmTarget = reducedMotion ? 0 : target > 0.05 ? 0.12 : 0.45 + 0.3 * Math.sin(elapsed * 0.38);
  // A medium opening favors the rounded frame; louder speech favors the wide
  // frame. This is an amplitude heuristic, never a claim of vowel recognition.
  const roundTarget = target > 0 ? Math.max(0, 1 - Math.abs(target - 0.43) / 0.36) : 0;
  const attentiveTarget = reducedMotion || target > 0.05 ? 0 : Math.max(0, Math.sin(elapsed * 0.51 - 1)) * 0.65;
  const onset = target > .18 && previous.mouth < .12 && previous.sinceOnset > .18;
  const syllable = previous.syllable + (onset ? 1 : 0);
  const silent = target === 0;
  const focusedTarget = reducedMotion || !silent ? 0 : Math.max(0, Math.sin(elapsed * .29 - 2.4)) * .4;
  const smileTarget = reducedMotion || !silent ? 0 : Math.max(0, Math.sin(elapsed * .24 - .6)) * .35;
  const closureTarget = silent && previous.mouth > .12 ? .65 : 0;
  const spreadTarget = !silent && syllable % 3 === 2 ? .7 : 0;
  return {
    mouth: mouth < 0.012 ? 0 : mouth,
    rounded: previous.rounded + (roundTarget - previous.rounded) * (1 - Math.exp(-step / 0.07)),
    attentive: previous.attentive + (attentiveTarget - previous.attentive) * (1 - Math.exp(-step / 0.7)),
    warmth: previous.warmth + (warmTarget - previous.warmth) * (1 - Math.exp(-step / 0.8)),
    focused: previous.focused + (focusedTarget - previous.focused) * (1 - Math.exp(-step / .8)),
    smile: previous.smile + (smileTarget - previous.smile) * (1 - Math.exp(-step / .9)),
    closure: closureTarget > previous.closure ? closureTarget : previous.closure * Math.exp(-step / .09),
    spread: previous.spread + (spreadTarget - previous.spread) * (1 - Math.exp(-step / .09)),
    syllable,
    sinceOnset: onset ? 0 : previous.sinceOnset + step,
    blink: reducedMotion ? { ...previous.blink, closed: 0, elapsed: null } : stepBlink(previous.blink, step, random),
    elapsed,
  };
}
