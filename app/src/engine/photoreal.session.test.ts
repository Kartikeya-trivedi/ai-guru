import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Audio ownership when the photoreal face is active.
 *
 * Exactly one path may play the interviewer's voice. Both playing doubles the
 * interviewer; neither playing makes them mute. Neither failure is visible to
 * a typechecker, and both are catastrophic in a live interview — so the
 * switch is pinned here, including its fallback behaviour.
 */

const h = vi.hoisted(() => ({
  openGeminiLive: vi.fn(),
  openSimliAvatar: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
  pushAudio: vi.fn(),
  interrupt: vi.fn(),
  avatarClose: vi.fn(),
}));

vi.mock("../providers/gemini/live", () => ({
  LIVE_MODEL: "test-model",
  GEMINI_INPUT_SAMPLE_RATE: 16000,
  openGeminiLive: h.openGeminiLive,
}));
vi.mock("../voice/capture", () => ({
  startMicCapture: vi.fn(async () => ({ level: () => 0, stop: vi.fn() })),
}));
vi.mock("../voice/playback", () => ({
  createAudioSink: vi.fn(() => ({
    enqueue: h.enqueue,
    flush: h.flush,
    isPlaying: () => false,
    level: () => 0,
    close: vi.fn(),
  })),
}));
vi.mock("./assess", () => ({ assessAnswer: vi.fn() }));
vi.mock("../video/capture", () => ({
  startCameraCapture: vi.fn(),
  startScreenCapture: vi.fn(),
}));
vi.mock("../avatar/simli", () => ({ openSimliAvatar: h.openSimliAvatar }));

import { InterviewSession, type SessionCallbacks } from "./session";
import type { ParsedResume } from "../resume/types";

const RESUME: ParsedResume = {
  name: "Test Candidate",
  summary: "",
  experience: [],
  projects: [],
  skills: [],
  education: [],
};

function callbacks(): SessionCallbacks {
  return {
    onTranscript: vi.fn(),
    onStageChange: vi.fn(),
    onThreadUpdate: vi.fn(),
    onLatency: vi.fn(),
    onError: vi.fn(),
    onNotice: vi.fn(),
    onStatus: vi.fn(),
    onTurnComplete: vi.fn(),
    onAvatarChange: vi.fn(),
    onAvatarSpeaking: vi.fn(),
  };
}

/**
 * A channel the test can push events into at any point, so events can be
 * emitted AFTER the avatar attaches — which is exactly when routing matters.
 */
function controllableChannel() {
  const queue: unknown[] = [];
  let wake: (() => void) | null = null;

  return {
    emit(ev: unknown) {
      queue.push(ev);
      wake?.();
    },
    channel: {
      sendAudio: vi.fn(),
      sendVideo: vi.fn(),
      updateContext: vi.fn(),
      close: vi.fn(),
      events: async function* () {
        for (;;) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = null;
          }
          const next = queue.shift();
          if (next !== undefined) yield next;
        }
      },
    },
  };
}

/** A connected avatar whose connection state the test controls. */
function fakeAvatar() {
  let live = true;
  return {
    handle: {
      pushAudio: h.pushAudio,
      interrupt: h.interrupt,
      close: h.avatarClose,
      isConnected: () => live,
    },
    drop: () => {
      live = false;
    },
  };
}

const audioEvent = () => ({ type: "audio", frame: new ArrayBuffer(8), sampleRate: 24000 });
const el = () => ({}) as HTMLVideoElement;
const aud = () => ({}) as HTMLAudioElement;
const settle = () => new Promise((r) => setTimeout(r, 10));

async function run(opts: { photoreal?: boolean } = {}) {
  const cb = callbacks();
  const driver = controllableChannel();
  const session = new InterviewSession(
    {
      apiKey: "k",
      resume: RESUME,
      jobTarget: { role: "AI Engineer", seniority: "mid" },
      ...(opts.photoreal ? { photoreal: { apiKey: "simli-key" } } : {}),
    },
    cb,
  );
  h.openGeminiLive.mockResolvedValue(driver.channel);
  await session.start();
  await settle();
  return { session, cb, emit: driver.emit };
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
});

describe("photoreal audio ownership", () => {
  it("plays locally when no avatar is configured", async () => {
    const { emit } = await run();
    emit(audioEvent());
    await settle();

    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.pushAudio).not.toHaveBeenCalled();
  });

  it("routes audio to the avatar and NOT the speaker once connected", async () => {
    const avatar = fakeAvatar();
    h.openSimliAvatar.mockResolvedValue(avatar.handle);

    const { session, emit } = await run({ photoreal: true });
    await session.attachPhotorealAvatar(el(), aud());
    h.enqueue.mockClear();

    emit(audioEvent());
    await settle();

    expect(h.pushAudio).toHaveBeenCalledTimes(1);
    // Playing both would double the interviewer's voice.
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("falls back to local playback on the very next chunk when the avatar drops", async () => {
    const avatar = fakeAvatar();
    h.openSimliAvatar.mockResolvedValue(avatar.handle);

    const { session, emit } = await run({ photoreal: true });
    await session.attachPhotorealAvatar(el(), aud());
    emit(audioEvent());
    await settle();
    expect(h.pushAudio).toHaveBeenCalledTimes(1);

    // Service goes away mid-interview: the candidate must keep hearing their
    // interviewer rather than sitting in silence.
    avatar.drop();
    h.pushAudio.mockClear();
    emit(audioEvent());
    await settle();

    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.pushAudio).not.toHaveBeenCalled();
    expect(session.isPhotorealActive()).toBe(false);
  });

  it("clears both paths on barge-in", async () => {
    const avatar = fakeAvatar();
    h.openSimliAvatar.mockResolvedValue(avatar.handle);

    const { session, emit } = await run({ photoreal: true });
    await session.attachPhotorealAvatar(el(), aud());

    emit({ type: "interrupted" });
    await settle();

    // A stale queue on the idle path would replay a cut-off sentence if the
    // other side dropped a moment later, so both are cleared.
    expect(h.flush).toHaveBeenCalled();
    expect(h.interrupt).toHaveBeenCalled();
  });

  it("does not touch the avatar service when unconfigured", async () => {
    const { session } = await run();
    await session.attachPhotorealAvatar(el(), aud());

    expect(h.openSimliAvatar).not.toHaveBeenCalled();
    expect(session.wantsPhotoreal()).toBe(false);
  });

  it("a refused avatar leaves the voice interview running", async () => {
    h.openSimliAvatar.mockRejectedValue(new Error("bad key"));
    const { session, cb, emit } = await run({ photoreal: true });

    await expect(session.attachPhotorealAvatar(el(), aud())).rejects.toThrow("bad key");

    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onStatus).toHaveBeenCalledWith("live");
    expect(session.isPhotorealActive()).toBe(false);

    // And audio still reaches the candidate.
    emit(audioEvent());
    await settle();
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });

  it("announces the face swap so the UI can switch renderers", async () => {
    const avatar = fakeAvatar();
    h.openSimliAvatar.mockResolvedValue(avatar.handle);

    const { session, cb } = await run({ photoreal: true });
    await session.attachPhotorealAvatar(el(), aud());

    expect(cb.onAvatarChange).toHaveBeenCalledWith(true);
  });

  it("closes the avatar when the interview ends", async () => {
    const avatar = fakeAvatar();
    h.openSimliAvatar.mockResolvedValue(avatar.handle);

    const { session } = await run({ photoreal: true });
    await session.attachPhotorealAvatar(el(), aud());
    session.stop();

    // Leaving it open would keep billing per-minute after the interview.
    expect(h.avatarClose).toHaveBeenCalled();
  });
});
