/**
 * Lip-sync and idle-motion maths for the interviewer avatar.
 *
 * Pure functions, kept out of the component so the behaviour that decides
 * whether the face reads as alive or as a puppet is actually testable.
 *
 * The whole trick is that mouth movement must come from the REAL output
 * amplitude. A mouth animated on a timer drifts out of sync within a
 * sentence, and a face that is visibly not saying the words you hear is
 * worse than no face at all.
 */

/** Speech RMS rarely exceeds this; treat it as "mouth fully open". */
const LOUD = 0.28;
/** Below this is room tone / silence between words — mouth closed. */
const FLOOR = 0.015;

/**
 * Raw RMS → 0..1 openness, before smoothing.
 *
 * The curve matters: linear mapping leaves the mouth barely moving through
 * normal speech, because conversational RMS sits low in the range. The
 * gamma < 1 lifts the mid-range so ordinary talking looks like talking.
 */
export function opennessFromLevel(level: number): number {
  if (!Number.isFinite(level) || level <= FLOOR) return 0;
  const norm = Math.min(1, (level - FLOOR) / (LOUD - FLOOR));
  return Math.pow(norm, 0.6);
}

/**
 * Asymmetric smoothing: mouths open fast and close slower.
 *
 * Symmetric smoothing makes speech look mushy; no smoothing makes it
 * jitter on every frame. dt is in seconds so the feel is frame-rate
 * independent — a 144Hz monitor must not animate faster than a 60Hz one.
 */
export function smoothOpenness(prev: number, target: number, dt: number): number {
  const tau = target > prev ? 0.045 : 0.11;
  const alpha = 1 - Math.exp(-dt / tau);
  return prev + (target - prev) * alpha;
}

export interface BlinkState {
  /** 0 = eyes open, 1 = fully closed. */
  closed: number;
  /** Seconds until the next blink starts. */
  nextIn: number;
  /** Seconds elapsed into the current blink, or null when not blinking. */
  elapsed: number | null;
}

/** Humans blink every ~2–6s; anything regular reads as a metronome. */
export function scheduleBlink(random: () => number = Math.random): number {
  return 2 + random() * 4;
}

const BLINK_DURATION = 0.14;

export function createBlinkState(random: () => number = Math.random): BlinkState {
  return { closed: 0, nextIn: scheduleBlink(random), elapsed: null };
}

/**
 * Advance the blink. A blink is a fast close and a slightly slower open,
 * which is why it uses a skewed curve rather than a symmetric sine.
 */
export function stepBlink(
  state: BlinkState,
  dt: number,
  random: () => number = Math.random,
): BlinkState {
  if (state.elapsed === null) {
    const nextIn = state.nextIn - dt;
    if (nextIn > 0) return { closed: 0, nextIn, elapsed: null };
    return { closed: 0, nextIn: 0, elapsed: 0 };
  }

  const elapsed = state.elapsed + dt;
  if (elapsed >= BLINK_DURATION) {
    return { closed: 0, nextIn: scheduleBlink(random), elapsed: null };
  }

  const t = elapsed / BLINK_DURATION;
  // Close over the first 40%, reopen over the rest.
  const closed = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
  return { closed: Math.max(0, Math.min(1, closed)), nextIn: 0, elapsed };
}

/**
 * Idle head motion — a tiny drift so the face isn't a frozen mask.
 *
 * Two out-of-phase sine waves at incommensurate periods, so it never visibly
 * loops. Amplitude is deliberately small: big movement looks like a bobbing
 * toy, and the goal is "present", not "animated".
 */
export function idleSway(tSeconds: number): { x: number; y: number; tilt: number } {
  return {
    x: Math.sin(tSeconds * 0.37) * 1.6,
    y: Math.sin(tSeconds * 0.53 + 1.1) * 1.1,
    tilt: Math.sin(tSeconds * 0.29 + 0.4) * 0.9,
  };
}

/** Slow vertical breathing offset for the shoulders. */
export function breathe(tSeconds: number): number {
  return Math.sin(tSeconds * 0.9) * 0.9;
}
