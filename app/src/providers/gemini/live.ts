import type {
  ProviderConfig,
  RealtimeVoiceChannel,
  VoiceEvent,
} from "../types";

/**
 * Gemini Live API realtime voice channel.
 *
 * Native speech-to-speech over a WebSocket: mic PCM in, model PCM out,
 * with server-side VAD and barge-in. This is the human-feel path — no
 * STT→LLM→TTS pipeline in the loop.
 *
 * Protocol: BidiGenerateContent
 *  - input  : raw PCM16, 16kHz, little-endian, base64 in realtimeInput.audio
 *  - output : raw PCM16 (rate declared in the response mimeType, 24kHz in
 *             practice), base64 in serverContent.modelTurn.parts[].inlineData
 */

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const GEMINI_INPUT_SAMPLE_RATE = 16000;
/** Fallback only — the actual rate is parsed from each chunk's mimeType. */
export const GEMINI_OUTPUT_SAMPLE_RATE_DEFAULT = 24000;

export interface GeminiLiveOptions extends ProviderConfig {
  systemInstruction: string;
  /** Prebuilt voice name, e.g. "Charon", "Kore", "Puck". */
  voiceName?: string;
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function arrayBufferFromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Parse "audio/pcm;rate=24000" → 24000. */
function sampleRateFromMime(mime: string | undefined): number {
  const m = mime?.match(/rate=(\d+)/);
  return m ? Number(m[1]) : GEMINI_OUTPUT_SAMPLE_RATE_DEFAULT;
}

/** Minimal async queue bridging WS callbacks → an async iterable of events. */
class EventQueue<T> {
  private items: T[] = [];
  private resolvers: ((r: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(item: T): void {
    if (this.done) return;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as never, done: true });
    }
    this.resolvers = [];
  }

  iterable(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            const item = self.items.shift();
            if (item !== undefined) {
              return Promise.resolve({ value: item, done: false });
            }
            if (self.done) {
              return Promise.resolve({ value: undefined as never, done: true });
            }
            return new Promise((resolve) => self.resolvers.push(resolve));
          },
        };
      },
    };
  }
}

export function openGeminiLive(
  opts: GeminiLiveOptions,
): Promise<RealtimeVoiceChannel> {
  const url = `${WS_URL}?key=${encodeURIComponent(opts.apiKey)}`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const queue = new EventQueue<VoiceEvent>();

  return new Promise((resolve, reject) => {
    let settled = false;

    ws.onopen = () => {
      const setup = {
        setup: {
          model: `models/${opts.model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            ...(opts.voiceName
              ? {
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: opts.voiceName },
                    },
                  },
                }
              : {}),
          },
          systemInstruction: { parts: [{ text: opts.systemInstruction }] },
          // Transcripts of both sides: needed for the transcript log,
          // the candidate model, and the final report.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      ws.send(JSON.stringify(setup));
    };

    ws.onerror = () => {
      const err = new Error("Gemini Live WebSocket error");
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        queue.push({ type: "error", message: err.message });
      }
    };

    ws.onclose = (ev) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Gemini Live closed before setup: ${ev.code} ${ev.reason}`));
        return;
      }
      queue.close();
    };

    ws.onmessage = async (ev) => {
      let raw: string;
      if (ev.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(ev.data);
      } else if (ev.data instanceof Blob) {
        raw = await ev.data.text();
      } else {
        raw = String(ev.data);
      }

      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        queue.push({ type: "error", message: `Unparseable message: ${raw.slice(0, 200)}` });
        return;
      }

      // setupComplete → the channel is live.
      if (msg.setupComplete !== undefined) {
        if (!settled) {
          settled = true;
          resolve(channel);
        }
        return;
      }

      const sc = msg.serverContent;
      if (!sc) return;

      // Barge-in: the user started talking over the model. Playback must flush.
      if (sc.interrupted) {
        queue.push({ type: "interrupted" });
        return;
      }

      if (sc.inputTranscription?.text) {
        queue.push({
          type: "transcript",
          role: "user",
          text: sc.inputTranscription.text,
          final: false,
        });
      }

      if (sc.outputTranscription?.text) {
        queue.push({
          type: "transcript",
          role: "assistant",
          text: sc.outputTranscription.text,
          final: false,
        });
      }

      for (const part of sc.modelTurn?.parts ?? []) {
        const inline = part.inlineData;
        if (inline?.data && String(inline.mimeType ?? "").startsWith("audio/")) {
          queue.push({
            type: "audio",
            frame: arrayBufferFromBase64(inline.data),
            // Verified 24000 Hz against the live API; parsed per chunk
            // rather than assumed, so a provider change can't desync pitch.
            sampleRate: sampleRateFromMime(inline.mimeType),
          });
        }
      }

      if (sc.turnComplete) queue.push({ type: "turn-complete" });
    };

    const channel: RealtimeVoiceChannel = {
      sendAudio(frame: ArrayBuffer): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: base64FromArrayBuffer(frame),
                mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
              },
            },
          }),
        );
      },

      updateContext(instructions: string): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Stage transitions: inject as a system-role turn the model reads
        // but doesn't answer aloud.
        ws.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: instructions }] }],
              turnComplete: false,
            },
          }),
        );
      },

      events: () => queue.iterable(),

      close(): void {
        queue.close();
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      },
    };
  });
}
