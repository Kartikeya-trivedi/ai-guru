/**
 * Voice activity detection for the Groq pipeline.
 *
 * Gemini Live does turn detection server-side; a transcribe-then-generate
 * pipeline has to decide for itself when the candidate has stopped talking.
 * Get this wrong in one direction and the interviewer talks over people; get
 * it wrong in the other and it sits in silence while they wait.
 *
 * Pure and frame-driven so the thresholds can be tested against synthetic
 * energy traces instead of by talking at a laptop.
 */

export interface VadConfig {
  /** Normalised RMS (0..1) above which a frame counts as speech. */
  threshold: number;
  /** Silence after speech before the turn is considered over. */
  hangoverMs: number;
  /** Utterances shorter than this are discarded — coughs, chair creaks, "um". */
  minSpeechMs: number;
}

export const DEFAULT_VAD: VadConfig = {
  // The mic runs with noiseSuppression and autoGainControl on, which puts a
  // quiet room well under 0.01 and speech comfortably over 0.02.
  threshold: 0.015,
  // Long enough to survive the pause mid-sentence that people take while
  // thinking, which is exactly when an interviewer must NOT interrupt.
  hangoverMs: 800,
  minSpeechMs: 250,
};

export type VadEvent = "speech-start" | "speech-end" | null;

export class Vad {
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;

  constructor(private cfg: VadConfig = DEFAULT_VAD) {}

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Feed one frame. Returns a transition, or null if nothing changed. */
  push(rms: number, frameMs: number): VadEvent {
    const loud = rms >= this.cfg.threshold;

    if (!this.speaking) {
      if (!loud) return null;
      this.speaking = true;
      this.speechMs = frameMs;
      this.silenceMs = 0;
      return "speech-start";
    }

    if (loud) {
      this.speechMs += frameMs;
      this.silenceMs = 0;
      return null;
    }

    this.silenceMs += frameMs;
    if (this.silenceMs < this.cfg.hangoverMs) return null;

    const long = this.speechMs >= this.cfg.minSpeechMs;
    this.reset();
    // A too-short burst still ends the state, but reports nothing — the
    // caller must not fire a transcription request for a cough.
    return long ? "speech-end" : null;
  }

  reset(): void {
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
  }
}

/** Normalised RMS (0..1) of a PCM16 frame. */
export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / pcm.length);
}
