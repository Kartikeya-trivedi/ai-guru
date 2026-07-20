/**
 * Voice latency instrumentation.
 *
 * The product bet is that conversation feels human. The metric that decides
 * that is **response latency**: from the moment the candidate stops talking
 * to the first sound of the interviewer's reply. Humans tolerate ~200-500ms
 * in conversation; past ~1s it reads as "talking to a machine".
 *
 * We can't run VAD locally without cost, so we approximate end-of-speech as
 * the timestamp of the last user transcript fragment the server sent before
 * the model's first audio chunk. This slightly *over*-reports latency
 * (transcripts lag speech a little), which is the safe direction for a gate.
 */

export interface TurnLatency {
  turn: number;
  /** ms from approximate end-of-user-speech to first model audio. */
  firstAudioMs: number;
}

export class LatencyTracker {
  private lastUserSpeechAt: number | null = null;
  private awaitingFirstAudio = false;
  private turn = 0;
  private samples: TurnLatency[] = [];

  /** Call on every user transcript fragment. */
  markUserSpeech(): void {
    this.lastUserSpeechAt = performance.now();
    this.awaitingFirstAudio = true;
  }

  /** Call on every model audio chunk; only the first of a turn counts. */
  markModelAudio(): TurnLatency | null {
    if (!this.awaitingFirstAudio || this.lastUserSpeechAt === null) return null;
    this.awaitingFirstAudio = false;
    const sample: TurnLatency = {
      turn: ++this.turn,
      firstAudioMs: Math.round(performance.now() - this.lastUserSpeechAt),
    };
    this.samples.push(sample);
    return sample;
  }

  /** Call on turn-complete so the next user utterance starts a fresh turn. */
  endTurn(): void {
    this.awaitingFirstAudio = false;
  }

  all(): TurnLatency[] {
    return [...this.samples];
  }

  percentile(p: number): number | null {
    if (this.samples.length === 0) return null;
    const sorted = this.samples.map((s) => s.firstAudioMs).sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    );
    return sorted[idx];
  }

  summary(): { count: number; p50: number | null; p95: number | null } {
    return {
      count: this.samples.length,
      p50: this.percentile(50),
      p95: this.percentile(95),
    };
  }
}
