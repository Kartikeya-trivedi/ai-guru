/**
 * Mic capture → PCM16 frames at 16kHz (Gemini Live input format).
 *
 * Uses an AudioWorklet (runs on the audio thread — no main-thread jank,
 * which matters when the UI is also rendering). The worklet is injected as
 * a blob so it needs no separate build step or served asset.
 */

const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    // ~20ms frames at 16kHz — small enough for low latency, large enough
    // to avoid flooding the WebSocket with tiny messages.
    this.frameSize = 320;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) this.buffer.push(channel[i]);
    while (this.buffer.length >= this.frameSize) {
      const frame = this.buffer.splice(0, this.frameSize);
      const pcm = new Int16Array(frame.length);
      let peak = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        const a = Math.abs(s);
        if (a > peak) peak = a;
      }
      this.port.postMessage({ pcm: pcm.buffer, peak }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

export interface MicCapture {
  /** Peak amplitude 0..1 of the most recent frame — for the level meter. */
  level(): number;
  stop(): void;
}

export async function startMicCapture(
  sampleRate: number,
  onFrame: (pcm16: ArrayBuffer) => void,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // Critical for voice: without these, the model hears itself through
      // the speakers and interrupts itself.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  return startCaptureFromStream(stream, sampleRate, onFrame);
}

/**
 * Capture from an arbitrary MediaStream. Split out from startMicCapture so
 * the PCM16 conversion path can be exercised with a synthetic stream — no
 * microphone, no human, no permission prompt.
 */
export async function startCaptureFromStream(
  stream: MediaStream,
  sampleRate: number,
  onFrame: (pcm16: ArrayBuffer) => void,
): Promise<MicCapture> {
  const ctx = new AudioContext({ sampleRate });
  const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "capture-processor");
  let peak = 0;

  node.port.onmessage = (ev) => {
    peak = ev.data.peak ?? 0;
    onFrame(ev.data.pcm as ArrayBuffer);
  };

  source.connect(node);
  // Worklets need a sink to be pulled; a muted gain node keeps the graph
  // alive without echoing the mic to the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute);
  mute.connect(ctx.destination);

  return {
    level: () => peak,
    stop() {
      node.port.onmessage = null;
      node.disconnect();
      source.disconnect();
      mute.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}
