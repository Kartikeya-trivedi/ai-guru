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
  /**
   * Loudness of what is coming out of the speaker RIGHT NOW, 0..1.
   *
   * This drives the avatar's mouth. It has to be measured from the real
   * output — faking a mouth on a timer desynchronises within a sentence and
   * reads instantly as a puppet, which is worse than no face at all.
   */
  level(): number;
  close(): void;
}

export function createAudioSink(): AudioSink {
  const ctx = new AudioContext();
  let playhead = 0;
  let sources: AudioBufferSourceNode[] = [];

  // Every chunk routes through the analyser so amplitude reflects exactly
  // what is audible, including during barge-in cut-offs.
  const analyser = ctx.createAnalyser();
  // Small FFT: we want a fast-responding envelope, not spectral detail.
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.3;
  analyser.connect(ctx.destination);
  const samples = new Uint8Array(analyser.fftSize);

  return {
    enqueue(pcm16: ArrayBuffer, sampleRate: number): void {
      const samples = new Int16Array(pcm16);
      if (samples.length === 0) return;

      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(analyser);

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

    level(): number {
      if (sources.length === 0) return 0;
      analyser.getByteTimeDomainData(samples);
      // RMS around the 128 midpoint. Peak would spike on transients and make
      // the mouth flap; RMS tracks perceived loudness, which is what a mouth
      // actually follows.
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / samples.length);
    },

    close(): void {
      this.flush();
      void ctx.close();
    },
  };
}
