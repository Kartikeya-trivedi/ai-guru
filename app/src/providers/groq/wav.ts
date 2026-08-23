/**
 * WAV encode/decode for the Groq voice pipeline.
 *
 * Groq's speech endpoints speak files, not streams: transcription takes an
 * uploaded audio file and speech returns a WAV. The mic gives us raw PCM16
 * and the player wants raw PCM16, so this is the adapter at both ends.
 *
 * The output sample rate is read from the returned header rather than
 * assumed. Groq does not document Orpheus's rate, and guessing wrong does not
 * fail loudly — it just makes the interviewer sound like a chipmunk or a
 * ghost, which is a bug someone would report as "the voice sounds weird".
 */

const HEADER_BYTES = 44;

/** Wrap mono PCM16 samples in a minimal RIFF/WAVE header. */
export function encodeWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + pcm.byteLength);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  new Int16Array(buffer, HEADER_BYTES).set(pcm);
  return buffer;
}

export interface DecodedWav {
  pcm: Int16Array;
  sampleRate: number;
}

/**
 * Read a WAV into mono PCM16.
 *
 * Chunks are walked rather than assumed to start at byte 36: encoders are
 * entitled to put LIST/fact chunks before the data, and a fixed offset would
 * read metadata as audio.
 */
export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (buffer.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    throw new Error("Not a WAV file");
  }

  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt ") {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataOffset = body;
      // A streamed WAV can declare size 0 or 0xFFFFFFFF; trust the buffer.
      dataLength = Math.min(size || Infinity, buffer.byteLength - body);
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  if (dataOffset < 0 || !sampleRate) throw new Error("WAV missing fmt or data chunk");
  if (bitsPerSample !== 16) throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);

  const samples = new Int16Array(dataLength >> 1);
  // byteOffset may be odd relative to the buffer, so copy through a DataView
  // rather than aliasing — a misaligned Int16Array constructor throws.
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(dataOffset + i * 2, true);
  }

  if (channels === 1) return { pcm: samples, sampleRate };

  // Downmix: the player is mono, and a stereo buffer played as mono would
  // interleave into noise at double speed.
  const mono = new Int16Array(Math.floor(samples.length / channels));
  for (let i = 0; i < mono.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c];
    mono[i] = sum / channels;
  }
  return { pcm: mono, sampleRate };
}
