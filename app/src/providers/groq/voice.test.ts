import { describe, it, expect, vi } from "vitest";
import { encodeWav, decodeWav } from "./wav";
import { Vad, rms, DEFAULT_VAD } from "./vad";
import { openGroqVoice, splitForSpeech } from "./voice";
import type { VoiceEvent } from "../types";

/**
 * The fallback only ever runs when the interview is already in trouble, which
 * means nobody will be watching it work and any bug here surfaces as "it just
 * stopped" at the worst possible moment. So it gets tested without a network,
 * a microphone, or a human.
 */

const SR = 16000;
const FRAME = 320; // 20 ms

function loudFrame(): Int16Array {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = i % 2 ? 8000 : -8000;
  return f;
}
const quietFrame = () => new Int16Array(FRAME);

describe("wav", () => {
  it("round-trips PCM and sample rate", () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const { pcm: out, sampleRate } = decodeWav(encodeWav(pcm, 24000));
    expect(sampleRate).toBe(24000);
    expect(Array.from(out)).toEqual(Array.from(pcm));
  });

  it("finds the data chunk even when metadata precedes it", () => {
    // Encoders may put LIST/fact chunks before the audio. Assuming byte 44
    // would read the metadata as samples — audible as a burst of noise.
    const base = encodeWav(new Int16Array([1, 2, 3, 4]), SR);
    const extraSize = 4;
    const out = new Uint8Array(base.byteLength + 8 + extraSize);
    const src = new Uint8Array(base);
    out.set(src.subarray(0, 12), 0); // RIFF....WAVE
    const view = new DataView(out.buffer);
    const tag = (off: number, t: string) => {
      for (let i = 0; i < 4; i++) view.setUint8(off + i, t.charCodeAt(i));
    };
    tag(12, "LIST");
    view.setUint32(16, extraSize, true);
    // 12 RIFF header + 4 id + 4 size + 4 body = the fmt chunk starts at 24.
    out.set(src.subarray(12), 24);
    view.setUint32(4, out.byteLength - 8, true);

    const { pcm } = decodeWav(out.buffer);
    expect(Array.from(pcm)).toEqual([1, 2, 3, 4]);
  });

  it("downmixes stereo rather than playing it as mono at double speed", () => {
    const stereo = encodeWav(new Int16Array([100, 300, 400, 600]), SR);
    // Rewrite the header to claim two channels.
    new DataView(stereo).setUint16(22, 2, true);
    const { pcm } = decodeWav(stereo);
    expect(Array.from(pcm)).toEqual([200, 500]);
  });

  it("rejects things that are not WAV instead of emitting noise", () => {
    expect(() => decodeWav(new ArrayBuffer(64))).toThrow(/not a wav/i);
  });
});

describe("vad", () => {
  const frames = (v: Vad, make: () => Int16Array, n: number) => {
    const events: (string | null)[] = [];
    for (let i = 0; i < n; i++) events.push(v.push(rms(make()), 20));
    return events;
  };

  it("opens a turn on speech and closes it after the hangover", () => {
    const v = new Vad();
    expect(frames(v, loudFrame, 1)[0]).toBe("speech-start");
    frames(v, loudFrame, 20);
    // Silence shorter than the hangover must NOT end the turn — that pause is
    // someone thinking, and cutting in there is the rudest thing this app
    // could do.
    const short = frames(v, quietFrame, DEFAULT_VAD.hangoverMs / 20 - 2);
    expect(short.every((e) => e === null)).toBe(true);

    const rest = frames(v, quietFrame, 4);
    expect(rest).toContain("speech-end");
  });

  it("discards bursts too short to be an answer", () => {
    // A cough must not trigger a transcription request and a reply.
    const v = new Vad();
    frames(v, loudFrame, 3); // 60 ms
    const out = frames(v, quietFrame, DEFAULT_VAD.hangoverMs / 20 + 2);
    expect(out).not.toContain("speech-end");
    expect(v.isSpeaking).toBe(false);
  });

  it("treats a quiet room as silence", () => {
    const v = new Vad();
    expect(frames(v, quietFrame, 50).every((e) => e === null)).toBe(true);
  });
});

describe("splitForSpeech", () => {
  it("keeps a short reply as one piece", () => {
    expect(splitForSpeech("Why did you pick a hash map?")).toEqual([
      "Why did you pick a hash map?",
    ]);
  });

  it("never exceeds the model's character cap", () => {
    const long = "This is a sentence about systems design. ".repeat(20);
    for (const piece of splitForSpeech(long)) expect(piece.length).toBeLessThanOrEqual(200);
  });

  it("breaks on sentences rather than mid-clause", () => {
    const out = splitForSpeech(`${"a".repeat(150)}. ${"b".repeat(150)}.`);
    expect(out).toHaveLength(2);
    expect(out[0].endsWith(".")).toBe(true);
  });

  it("hard-splits a single token longer than the cap instead of dropping it", () => {
    const out = splitForSpeech("x".repeat(450));
    expect(out.join("")).toHaveLength(450);
    for (const piece of out) expect(piece.length).toBeLessThanOrEqual(200);
  });
});

describe("openGroqVoice pipeline", () => {
  function mockFetch(reply = "Why a hash map and not a tree?") {
    return vi.fn(async (url: string) => {
      if (String(url).includes("/audio/transcriptions")) {
        return { ok: true, json: async () => ({ text: "I used a hash map for lookups." }) };
      }
      if (String(url).includes("/chat/completions")) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: reply } }] }) };
      }
      if (String(url).includes("/audio/speech")) {
        return { ok: true, arrayBuffer: async () => encodeWav(new Int16Array(240), 24000) };
      }
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
  }

  const calls = (f: typeof fetch) => (f as unknown as { mock: { calls: any[][] } }).mock.calls;

  async function drain(events: AsyncIterable<VoiceEvent>, until: number): Promise<VoiceEvent[]> {
    const out: VoiceEvent[] = [];
    for await (const ev of events) {
      out.push(ev);
      if (out.length >= until) break;
    }
    return out;
  }

  /** Speak, then go quiet long enough for the turn to close. */
  function utter(channel: { sendAudio(f: ArrayBuffer): void }) {
    for (let i = 0; i < 20; i++) channel.sendAudio(loudFrame().buffer);
    for (let i = 0; i < DEFAULT_VAD.hangoverMs / 20 + 2; i++) {
      channel.sendAudio(quietFrame().buffer);
    }
  }

  it("transcribes, answers, and speaks a full turn", async () => {
    const fetchImpl = mockFetch();
    const channel = await openGroqVoice(
      { apiKey: "k", systemInstruction: "be an interviewer", fetchImpl },
      SR,
    );

    const collected = drain(channel.events(), 4);
    utter(channel);
    const events = await collected;

    expect(events.map((e) => e.type)).toEqual([
      "transcript",
      "transcript",
      "audio",
      "turn-complete",
    ]);
    // The sample rate must come from the returned header, not a constant —
    // getting it wrong makes the interviewer sound like a chipmunk.
    expect(events.find((e) => e.type === "audio")).toMatchObject({ sampleRate: 24000 });
  });

  it("carries prior turns in, so a mid-interview failover resumes", async () => {
    const fetchImpl = mockFetch();
    const channel = await openGroqVoice(
      {
        apiKey: "k",
        systemInstruction: "be an interviewer",
        history: [{ role: "assistant", content: "Tell me about kllm." }],
        fetchImpl,
      },
      SR,
    );

    const collected = drain(channel.events(), 4);
    utter(channel);
    await collected;

    const chat = calls(fetchImpl).find((c) => String(c[0]).includes("/chat/completions"));
    const sent = JSON.parse(chat![1].body);
    expect(sent.messages[1]).toEqual({ role: "assistant", content: "Tell me about kllm." });
  });

  it("ignores Whisper's stock hallucinations instead of answering them", async () => {
    // Near-silence does not transcribe to "" — it comes back as a confident
    // "Thank you." Answering that means the interviewer replies to nothing and
    // then grades the candidate on words they never said.
    for (const artefact of ["Thank you.", "you", "Bye.", "Thanks for watching!"]) {
      const fetchImpl = vi.fn(async (url: string) => {
        if (String(url).includes("/audio/transcriptions")) {
          return { ok: true, json: async () => ({ text: artefact }) };
        }
        throw new Error("should not have reached the model");
      }) as unknown as typeof fetch;

      const channel = await openGroqVoice(
        { apiKey: "k", systemInstruction: "x", fetchImpl },
        SR,
      );
      utter(channel);
      await new Promise((r) => setTimeout(r, 20));

      expect(calls(fetchImpl).some((c) => String(c[0]).includes("/chat/"))).toBe(false);
    }
  });

  it("still answers a real sentence that merely contains a stock phrase", async () => {
    const fetchImpl = mockFetch();
    (fetchImpl as any).mockImplementation(async (url: string) => {
      if (String(url).includes("/audio/transcriptions")) {
        return { ok: true, json: async () => ({ text: "Thank you, so I used a hash map here." }) };
      }
      if (String(url).includes("/chat/completions")) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: "Why?" } }] }) };
      }
      return { ok: true, arrayBuffer: async () => encodeWav(new Int16Array(240), 24000) };
    });

    const channel = await openGroqVoice(
      { apiKey: "k", systemInstruction: "x", fetchImpl },
      SR,
    );
    const collected = drain(channel.events(), 4);
    utter(channel);
    await collected;

    expect(calls(fetchImpl).some((c) => String(c[0]).includes("/chat/"))).toBe(true);
  });

  it("does not answer a cough", async () => {
    const fetchImpl = mockFetch();
    const channel = await openGroqVoice(
      { apiKey: "k", systemInstruction: "be an interviewer", fetchImpl },
      SR,
    );

    for (let i = 0; i < 3; i++) channel.sendAudio(loudFrame().buffer);
    for (let i = 0; i < DEFAULT_VAD.hangoverMs / 20 + 2; i++) {
      channel.sendAudio(quietFrame().buffer);
    }
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("takes steering as context without speaking it aloud", async () => {
    const fetchImpl = mockFetch();
    const channel = await openGroqVoice(
      { apiKey: "k", systemInstruction: "be an interviewer", fetchImpl },
      SR,
    );
    channel.updateContext("[INTERVIEWER NOTE] move to the coding round");

    const collected = drain(channel.events(), 4);
    utter(channel);
    await collected;

    const chat = calls(fetchImpl).find((c) => String(c[0]).includes("/chat/completions"));
    const sent = JSON.parse(chat![1].body);
    const steer = sent.messages.find((m: any) => m.content.includes("coding round"));
    expect(steer).toBeDefined();
    // Steering is context, never something the candidate hears.
    expect(steer.role).toBe("system");
  });

  it("has no vision path, and says so by omission rather than a silent no-op", async () => {
    const channel = await openGroqVoice(
      { apiKey: "k", systemInstruction: "x", fetchImpl: mockFetch() },
      SR,
    );
    // session.ts calls this optionally. Absent means the caller can detect it;
    // a no-op would swallow the camera the candidate deliberately turned on.
    expect(channel.sendVideo).toBeUndefined();
  });
});
