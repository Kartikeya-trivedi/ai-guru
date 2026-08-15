import { describe, it, expect } from "vitest";
import {
  AVATAR_SAMPLE_RATE,
  pcm16ToBytes,
  resamplePcm16,
  toAvatarAudio,
} from "./resample";

/**
 * Getting the rate wrong does not throw — it produces a face whose mouth runs
 * at 1.5x the speed of the voice. That is invisible to a typechecker and
 * glaring to a user, so it is pinned here.
 */

/** A sine at `freq` Hz, for checking that content survives the conversion. */
function tone(freq: number, rate: number, seconds: number): Int16Array {
  const out = new Int16Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000);
  }
  return out;
}

/** Zero crossings per second — a cheap proxy for "is the pitch preserved". */
function crossingsPerSecond(buf: Int16Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] < 0 && buf[i] >= 0) || (buf[i - 1] >= 0 && buf[i] < 0)) crossings++;
  }
  return crossings / (buf.length / rate);
}

describe("resamplePcm16", () => {
  it("converts 24kHz to 16kHz at the right length", () => {
    // The Gemini -> Simli case. 3:2 means two thirds as many samples.
    const input = tone(440, 24000, 0.5);
    const out = resamplePcm16(input, 24000, 16000);
    expect(out.length).toBe(8000);
  });

  it("preserves pitch — the whole point of resampling", () => {
    // If this drifts, the avatar's mouth desyncs from the voice.
    const input = tone(440, 24000, 1);
    const out = resamplePcm16(input, 24000, 16000);
    const before = crossingsPerSecond(input, 24000);
    const after = crossingsPerSecond(out, 16000);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.05);
  });

  it("is a no-op when rates already match", () => {
    const input = tone(300, 16000, 0.1);
    // Same reference back: no pointless copy on the hot audio path.
    expect(resamplePcm16(input, 16000, 16000)).toBe(input);
  });

  it("handles an empty chunk without throwing", () => {
    expect(resamplePcm16(new Int16Array(0), 24000, 16000).length).toBe(0);
  });

  it("never wraps a loud sample to the opposite sign", () => {
    // Interpolating two near-full-scale samples can exceed Int16 range; a wrap
    // would flip +32767 to -32768 and click audibly.
    const loud = new Int16Array(600).fill(32767);
    const out = resamplePcm16(loud, 24000, 16000);
    for (const s of out) expect(s).toBeGreaterThan(0);
  });

  it("upsamples as well as downsamples", () => {
    const out = resamplePcm16(tone(200, 16000, 0.25), 16000, 24000);
    expect(out.length).toBe(6000);
  });

  it("does not emit a zero-length buffer for a very short chunk", () => {
    // A single-sample chunk must still yield something rather than nothing.
    expect(resamplePcm16(new Int16Array([1234]), 24000, 16000).length).toBeGreaterThan(0);
  });
});

describe("pcm16ToBytes", () => {
  it("exposes PCM16 as little-endian bytes", () => {
    const pcm = new Int16Array([1, -1]);
    const bytes = pcm16ToBytes(pcm);
    expect(bytes.length).toBe(4);
    expect([bytes[0], bytes[1]]).toEqual([1, 0]);
    expect([bytes[2], bytes[3]]).toEqual([255, 255]);
  });
});

describe("toAvatarAudio", () => {
  it("always lands on the avatar's required rate", () => {
    const input = tone(440, 24000, 0.5);
    const bytes = toAvatarAudio(input.buffer, 24000);
    // 0.5s at 16kHz, 2 bytes per sample.
    expect(bytes.length).toBe(0.5 * AVATAR_SAMPLE_RATE * 2);
  });

  it("passes 16kHz audio through untouched", () => {
    const input = tone(440, 16000, 0.25);
    expect(toAvatarAudio(input.buffer, 16000).length).toBe(input.length * 2);
  });
});
