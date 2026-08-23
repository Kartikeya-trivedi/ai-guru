import type { ChatMessage, RealtimeVoiceChannel, VoiceEvent } from "../types";
import { GROQ_BASE_URL, GROQ_ASSESSMENT_MODEL } from "./models";
import { encodeWav, decodeWav } from "./wav";
import { Vad, rms, DEFAULT_VAD } from "./vad";

/**
 * Groq voice as a degraded fallback, NOT a peer of Gemini Live.
 *
 * When a Gemini key runs out of quota mid-interview the session is simply
 * over: the candidate is left talking into a dead socket twenty minutes in,
 * and the report keeps whatever it happened to collect. A slower interviewer
 * is unambiguously better than that, so this exists to finish the hour.
 *
 * It is a pipeline — transcribe, generate, speak — where Gemini Live is one
 * hop. Three sequential round trips cannot match 544 ms, and this file does
 * not pretend otherwise; it is chosen only when the alternative is nothing.
 * The honest costs:
 *
 *  - Turn-taking is ours to detect (see vad.ts) rather than the server's.
 *  - It cannot see. Gemini Live accepts video frames; there is no vision hop
 *    here, so sendVideo is deliberately absent rather than a no-op that
 *    silently discards the camera the candidate chose to turn on.
 *  - Barge-in cancels playback and the in-flight request, but a sentence
 *    already handed to the speaker finishes.
 */

export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";
/** Orpheus voices: autumn, diana, hannah, austin, daniel, troy. */
export const GROQ_TTS_VOICE = "troy";

/** Orpheus rejects input over 200 characters, so replies are spoken in pieces. */
const TTS_CHAR_LIMIT = 200;

export interface GroqVoiceOptions {
  apiKey: string;
  systemInstruction: string;
  /** Prior turns, so a mid-interview failover resumes rather than restarts. */
  history?: ChatMessage[];
  voice?: string;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
  /** Injected by tests; defaults to the real fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Split a reply into speakable pieces under the character cap.
 *
 * Sentence boundaries first, because a cut mid-clause is audible as a wrong
 * breath. Anything still over the cap breaks at a word boundary, and a single
 * token longer than the cap is hard-split rather than dropped — losing a word
 * silently would be worse than saying it awkwardly.
 */
export function splitForSpeech(text: string, limit = TTS_CHAR_LIMIT): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const out: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };

  const append = (word: string) => {
    const joined = current ? `${current} ${word}` : word;
    if (joined.length > limit) {
      flush();
      current = word;
    } else {
      current = joined;
    }
  };

  for (const sentence of sentences) {
    if (sentence.length <= limit) {
      append(sentence);
      continue;
    }
    flush();
    for (const word of sentence.split(" ")) {
      if (word.length > limit) {
        flush();
        for (let i = 0; i < word.length; i += limit) out.push(word.slice(i, i + limit));
        continue;
      }
      append(word);
    }
    flush();
  }

  flush();
  return out;
}

/** Minimal async queue bridging callbacks to an async iterable of events. */
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
    for (const resolve of this.resolvers) resolve({ value: undefined as never, done: true });
    this.resolvers = [];
  }

  iterable(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            const item = self.items.shift();
            if (item !== undefined) return Promise.resolve({ value: item, done: false });
            if (self.done) return Promise.resolve({ value: undefined as never, done: true });
            return new Promise((resolve) => self.resolvers.push(resolve));
          },
        };
      },
    };
  }
}

/** capture.ts emits 320 samples at 16 kHz. */
const FRAME_MS = 20;

export async function openGroqVoice(
  opts: GroqVoiceOptions,
  inputSampleRate: number,
): Promise<RealtimeVoiceChannel> {
  const doFetch = opts.fetchImpl ?? fetch;
  const queue = new EventQueue<VoiceEvent>();
  const vad = new Vad(DEFAULT_VAD);

  const conversation: ChatMessage[] = [
    { role: "system", content: opts.systemInstruction },
    ...(opts.history ?? []),
  ];

  let utterance: Int16Array[] = [];
  let busy = false;
  let closed = false;
  let inFlight: AbortController | null = null;

  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  async function transcribe(pcm: Int16Array, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    const wav = new Blob([encodeWav(pcm, inputSampleRate)], { type: "audio/wav" });
    form.append("file", wav, "turn.wav");
    form.append("model", opts.sttModel ?? GROQ_STT_MODEL);
    form.append("response_format", "json");

    const res = await doFetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: auth,
      body: form,
      signal,
    });
    if (!res.ok) {
      throw new Error(`Groq transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    return String(json.text ?? "").trim();
  }

  async function reply(signal: AbortSignal): Promise<string> {
    const res = await doFetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: opts.llmModel ?? GROQ_ASSESSMENT_MODEL,
        // An interviewer speaking aloud is short by nature, and every extra
        // sentence is another TTS round trip the candidate waits through.
        max_completion_tokens: 220,
        temperature: 0.7,
        include_reasoning: false,
        reasoning_effort: "low",
        messages: conversation,
      }),
    });
    if (!res.ok) {
      throw new Error(`Groq chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    return String(json.choices?.[0]?.message?.content ?? "").trim();
  }

  async function speak(text: string, signal: AbortSignal): Promise<void> {
    // A sentence at a time: the first plays while the rest are still being
    // rendered, which is the only latency this shape can claw back.
    for (const piece of splitForSpeech(text)) {
      if (closed || signal.aborted) return;
      const res = await doFetch(`${GROQ_BASE_URL}/audio/speech`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: opts.ttsModel ?? GROQ_TTS_MODEL,
          voice: opts.voice ?? GROQ_TTS_VOICE,
          input: piece,
          response_format: "wav",
        }),
      });
      if (!res.ok) {
        throw new Error(`Groq speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      // The rate comes off the header rather than a constant: Groq does not
      // document Orpheus's output rate, and guessing wrong does not fail
      // loudly, it just makes the interviewer sound wrong.
      const { pcm, sampleRate } = decodeWav(await res.arrayBuffer());
      queue.push({ type: "audio", frame: pcm.buffer as ArrayBuffer, sampleRate });
    }
  }

  async function runTurn(pcm: Int16Array): Promise<void> {
    busy = true;
    const controller = new AbortController();
    inFlight = controller;
    try {
      const heard = await transcribe(pcm, controller.signal);
      // Whisper will confidently invent text from room tone, so a turn that
      // transcribes to almost nothing is dropped rather than answered —
      // otherwise the interviewer replies to a cough.
      if (heard.length < 2) return;

      queue.push({ type: "transcript", role: "user", text: heard, final: true });
      conversation.push({ role: "user", content: heard });

      const said = await reply(controller.signal);
      if (!said) return;

      queue.push({ type: "transcript", role: "assistant", text: said, final: true });
      conversation.push({ role: "assistant", content: said });

      await speak(said, controller.signal);
      queue.push({ type: "turn-complete" });
    } catch (e) {
      // An abort is a barge-in, which is ordinary conversation rather than a
      // failure worth showing anyone.
      if (e instanceof Error && e.name === "AbortError") return;
      queue.push({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      busy = false;
      if (inFlight === controller) inFlight = null;
    }
  }

  return {
    sendAudio(frame: ArrayBuffer): void {
      if (closed) return;
      const pcm = new Int16Array(frame);
      const event = vad.push(rms(pcm), FRAME_MS);

      if (event === "speech-start") {
        utterance = [];
        // They started talking while the interviewer was mid-reply.
        if (busy) {
          inFlight?.abort();
          queue.push({ type: "interrupted" });
        }
      }

      if (vad.isSpeaking) utterance.push(pcm);

      if (event === "speech-end" && utterance.length) {
        const total = utterance.reduce((n, chunk) => n + chunk.length, 0);
        const joined = new Int16Array(total);
        let at = 0;
        for (const chunk of utterance) {
          joined.set(chunk, at);
          at += chunk.length;
        }
        utterance = [];
        void runTurn(joined);
      }
    },

    // sendVideo is intentionally not implemented — see the header.

    updateContext(instructions: string): void {
      // There is no side channel here, so steering goes in as a system turn.
      // It is never spoken; it shapes the next reply, which is what steering
      // means on the Gemini path too.
      conversation.push({ role: "system", content: instructions });
    },

    events: () => queue.iterable(),

    close(): void {
      closed = true;
      inFlight?.abort();
      queue.close();
    },
  };
}
