/**
 * PCM16 resampling for the photoreal avatar path.
 *
 * Gemini Live emits 24 kHz mono PCM16; Simli expects 16 kHz mono PCM16.
 * Feeding it the wrong rate does not error — it produces a face whose mouth
 * moves at 1.5x the speed of the voice, which is the single most obvious way
 * to make an avatar look fake.
 *
 * 24k -> 16k is a 3:2 decimation. Dropping every third sample would alias
 * anything above 8 kHz down into the speech band as a metallic buzz, so we
 * low-pass first. The filter is deliberately cheap: this runs on every audio
 * chunk during a live conversation, and Simli only needs clean phoneme
 * energy, not mastering-grade audio.
 */

/** Simli's required input rate. */
export const AVATAR_SAMPLE_RATE = 16000;

/**
 * Resample mono PCM16.
 *
 * Uses linear interpolation with a 3-tap moving-average pre-filter. The
 * average is a crude low-pass that takes the edge off the frequencies which
 * would alias worst on a 3:2 ratio — enough to keep decimation from sounding
 * gritty, without designing a real FIR.
 */
export function resamplePcm16(
  input: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate || input.length === 0) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);

  // Only pre-filter when downsampling; upsampling cannot alias.
  const smooth = ratio > 1;

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    const a = sampleAt(input, idx, smooth);
    const b = sampleAt(input, idx + 1, smooth);
    const value = a + (b - a) * frac;

    // Clamp: interpolating two near-full-scale samples can exceed the Int16
    // range, which would wrap to the opposite sign and click audibly.
    out[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }

  return out;
}

/** Read a sample, optionally averaged with its neighbours, clamped at the edges. */
function sampleAt(buf: Int16Array, i: number, smooth: boolean): number {
  const at = (j: number): number => buf[Math.max(0, Math.min(buf.length - 1, j))];
  if (!smooth) return at(i);
  return (at(i - 1) + at(i) + at(i + 1)) / 3;
}

/** Simli's transport takes bytes; PCM16 goes on the wire little-endian. */
export function pcm16ToBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

/**
 * Raw provider chunk -> avatar-ready bytes. Kept in one place so a caller
 * cannot accidentally skip the rate conversion.
 */
export function toAvatarAudio(chunk: ArrayBuffer, fromRate: number): Uint8Array {
  const resampled = resamplePcm16(new Int16Array(chunk), fromRate, AVATAR_SAMPLE_RATE);
  return pcm16ToBytes(resampled);
}
