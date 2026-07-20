/**
 * Interruptible PCM16 playback queue.
 *
 * Model audio arrives in chunks faster than realtime; we schedule them
 * back-to-back on the AudioContext clock so speech is gapless. On barge-in
 * every queued chunk must stop *immediately* — a real interviewer stops
 * talking the moment you cut in, and lag here is what makes voice AI feel
 * robotic.
 */

export interface AudioSink {
  /** Enqueue a PCM16 (little-endian) chunk at the given sample rate. */
  enqueue(pcm16: ArrayBuffer, sampleRate: number): void;
  /** Barge-in: drop everything queued and go silent now. */
  flush(): void;
  /** True while audio is actually playing. */
  isPlaying(): boolean;
  close(): void;
}

export function createAudioSink(): AudioSink {
  const ctx = new AudioContext();
  let playhead = 0;
  let sources: AudioBufferSourceNode[] = [];

  return {
    enqueue(pcm16: ArrayBuffer, sampleRate: number): void {
      const samples = new Int16Array(pcm16);
      if (samples.length === 0) return;

      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      // Schedule after whatever is already queued; if we've fallen behind
      // (playhead in the past), start now.
      const startAt = Math.max(ctx.currentTime, playhead);
      src.start(startAt);
      playhead = startAt + buffer.duration;

      sources.push(src);
      src.onended = () => {
        sources = sources.filter((s) => s !== src);
      };
    },

    flush(): void {
      for (const src of sources) {
        try {
          src.stop();
        } catch {
          // Already ended — fine.
        }
      }
      sources = [];
      playhead = ctx.currentTime;
    },

    isPlaying: () => sources.length > 0,

    close(): void {
      this.flush();
      void ctx.close();
    },
  };
}
