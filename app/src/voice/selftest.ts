/**
 * Browser self-tests for the audio path.
 *
 * The mic and speakers need a human to fully judge, but the machinery
 * between them — worklet frame size, PCM16 conversion, playback scheduling,
 * barge-in flush — is deterministic and can be verified with synthetic
 * audio. Exposed on window in dev so an automated browser check can run it.
 */

import { startCaptureFromStream } from "./capture";
import { createAudioSink } from "./playback";

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
}

/** A 440Hz tone as a MediaStream — stands in for a microphone. */
function syntheticStream(ctx: AudioContext): MediaStream {
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  return dest.stream;
}

async function testCapturePipeline(): Promise<SelfTestResult> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const frames: ArrayBuffer[] = [];
    const cap = await startCaptureFromStream(syntheticStream(ctx), 16000, (f) =>
      frames.push(f),
    );
    await new Promise((r) => setTimeout(r, 600));
    const level = cap.level();
    cap.stop();

    if (frames.length === 0) {
      return { name: "capture pipeline", pass: false, detail: "no frames produced" };
    }
    // 20ms frames at 16kHz = 320 samples = 640 bytes.
    const sizesOk = frames.every((f) => f.byteLength === 640);
    // A 440Hz tone must register on the level meter and produce non-silent PCM.
    const samples = new Int16Array(frames[Math.floor(frames.length / 2)]);
    const nonSilent = samples.some((s) => Math.abs(s) > 1000);

    return {
      name: "capture pipeline",
      pass: sizesOk && nonSilent && level > 0.1,
      detail: `${frames.length} frames, ${sizesOk ? "640B each" : "WRONG SIZE"}, ${
        nonSilent ? "tone present" : "SILENT"
      }, level=${level.toFixed(2)}`,
    };
  } catch (e) {
    return { name: "capture pipeline", pass: false, detail: String(e) };
  } finally {
    void ctx.close();
  }
}

async function testPlaybackAndBargeIn(): Promise<SelfTestResult> {
  try {
    const sink = createAudioSink();
    // 1 second of 24kHz audio, queued as 10 chunks like the model sends.
    for (let i = 0; i < 10; i++) {
      const pcm = new Int16Array(2400);
      for (let j = 0; j < pcm.length; j++) {
        pcm[j] = Math.sin((j / 24000) * 440 * 2 * Math.PI) * 8000;
      }
      sink.enqueue(pcm.buffer, 24000);
    }
    const playingAfterEnqueue = sink.isPlaying();

    // Barge-in: everything must go silent immediately, not after the queue drains.
    sink.flush();
    const playingAfterFlush = sink.isPlaying();
    sink.close();

    return {
      name: "playback + barge-in flush",
      pass: playingAfterEnqueue && !playingAfterFlush,
      detail: `queued=${playingAfterEnqueue}, silent-after-flush=${!playingAfterFlush}`,
    };
  } catch (e) {
    return { name: "playback + barge-in flush", pass: false, detail: String(e) };
  }
}

export async function runAudioSelfTests(): Promise<SelfTestResult[]> {
  return [await testCapturePipeline(), await testPlaybackAndBargeIn()];
}

if (import.meta.env.DEV) {
  (window as unknown as { runAudioSelfTests: typeof runAudioSelfTests }).runAudioSelfTests =
    runAudioSelfTests;
}
