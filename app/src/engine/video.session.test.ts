import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Video routing in the live session.
 *
 * The wire protocol sends bare frames with no source label, so the ONLY thing
 * telling the model whether it is looking at a face or a code editor is the
 * announcement we inject. Getting this wrong means the interviewer reasons
 * about a screenshot as if it were the candidate — so it is worth pinning.
 */

const h = vi.hoisted(() => ({
  updateContext: vi.fn(),
  sendVideo: vi.fn(),
  openGeminiLive: vi.fn(),
  startCameraCapture: vi.fn(),
  startScreenCapture: vi.fn(),
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
  createAudioSink: vi.fn(() => ({ enqueue: vi.fn(), flush: vi.fn(), isPlaying: () => false, close: vi.fn() })),
}));
vi.mock("./assess", () => ({ assessAnswer: vi.fn() }));
vi.mock("../video/capture", () => ({
  startCameraCapture: h.startCameraCapture,
  startScreenCapture: h.startScreenCapture,
}));

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
    onVideoChange: vi.fn(),
  };
}

/** Captures the onFrame callback so a test can push frames itself. */
function captureStub(name: "camera" | "screen") {
  let onFrame: ((jpeg: ArrayBuffer, source: "camera" | "screen") => void) | null = null;
  let ended = false;
  const stub = vi.fn(async (cb: (jpeg: ArrayBuffer, source: "camera" | "screen") => void) => {
    onFrame = cb;
    return {
      stream: { id: `${name}-stream` } as unknown as MediaStream,
      source: name,
      ended: () => ended,
      stop: vi.fn(() => {
        ended = true;
      }),
    };
  });
  return {
    stub,
    emit: (bytes = 4) => onFrame?.(new ArrayBuffer(bytes), name),
    end: () => {
      ended = true;
    },
  };
}

function idleChannel() {
  return {
    sendAudio: vi.fn(),
    sendVideo: h.sendVideo,
    updateContext: h.updateContext,
    close: vi.fn(),
    // Never yields — the session stays live for the duration of the test.
    events: async function* () {
      await new Promise(() => {});
    },
  };
}

async function liveSession(opts: { camera?: boolean } = {}) {
  const cb = callbacks();
  const session = new InterviewSession(
    { apiKey: "k", resume: RESUME, jobTarget: { role: "AI Engineer", seniority: "mid" }, ...opts },
    cb,
  );
  await session.start();
  await new Promise((r) => setTimeout(r, 0));
  return { session, cb };
}

beforeEach(() => {
  h.updateContext.mockReset();
  h.sendVideo.mockReset();
  h.openGeminiLive.mockReset();
  h.startCameraCapture.mockReset();
  h.startScreenCapture.mockReset();
  h.openGeminiLive.mockResolvedValue(idleChannel());
});

describe("video routing", () => {
  it("forwards camera frames to the channel and announces the source once", async () => {
    const cam = captureStub("camera");
    h.startCameraCapture.mockImplementation(cam.stub);

    const { session } = await liveSession({ camera: true });
    cam.emit();
    cam.emit();
    cam.emit();

    expect(h.sendVideo).toHaveBeenCalledTimes(3);
    // Announced once, not once per frame — per-frame chatter would drown the
    // actual conversation in system notes.
    const announcements = h.updateContext.mock.calls.filter((c) => String(c[0]).includes("[VIDEO]"));
    expect(announcements).toHaveLength(1);
    expect(String(announcements[0][0])).toContain("CAMERA");
    session.stop();
  });

  it("drops camera frames while a screen share is up", async () => {
    const cam = captureStub("camera");
    const scr = captureStub("screen");
    h.startCameraCapture.mockImplementation(cam.stub);
    h.startScreenCapture.mockImplementation(scr.stub);

    const { session } = await liveSession({ camera: true });
    await session.startScreenShare();
    h.sendVideo.mockClear();

    // Both sources are producing; only the screen should reach the model, or
    // it would flip between a face and an editor with no idea which is which.
    cam.emit();
    scr.emit();
    cam.emit();

    expect(h.sendVideo).toHaveBeenCalledTimes(1);
    expect(h.sendVideo.mock.calls[0][1]).toBe("screen");
    session.stop();
  });

  it("falls back to camera frames once sharing stops", async () => {
    const cam = captureStub("camera");
    const scr = captureStub("screen");
    h.startCameraCapture.mockImplementation(cam.stub);
    h.startScreenCapture.mockImplementation(scr.stub);

    const { session } = await liveSession({ camera: true });
    await session.startScreenShare();
    session.stopScreenShare();
    h.sendVideo.mockClear();

    cam.emit();
    expect(h.sendVideo).toHaveBeenCalledTimes(1);
    expect(h.sendVideo.mock.calls[0][1]).toBe("camera");
    session.stop();
  });

  it("does not touch the camera when the candidate did not opt in", async () => {
    const cam = captureStub("camera");
    h.startCameraCapture.mockImplementation(cam.stub);

    const { session } = await liveSession({ camera: false });
    expect(h.startCameraCapture).not.toHaveBeenCalled();
    session.stop();
  });

  it("a refused camera is a notice, not a failed interview", async () => {
    h.startCameraCapture.mockRejectedValue(new Error("Camera access was blocked."));

    const { session, cb } = await liveSession({ camera: true });
    await new Promise((r) => setTimeout(r, 0));

    // The voice interview must survive: status stays live, and the user gets a
    // calm notice rather than a fatal error.
    expect(cb.onNotice).toHaveBeenCalledWith(expect.stringContaining("Camera access was blocked."));
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onStatus).toHaveBeenCalledWith("live");
    session.stop();
  });

  it("records integrity events for camera and screen lifecycle", async () => {
    const cam = captureStub("camera");
    const scr = captureStub("screen");
    h.startCameraCapture.mockImplementation(cam.stub);
    h.startScreenCapture.mockImplementation(scr.stub);

    const { session } = await liveSession({ camera: true });
    await session.startScreenShare();
    session.stopScreenShare();

    const kinds = session.getIntegrityEvents().map((e) => e.kind);
    expect(kinds).toContain("camera-started");
    expect(kinds).toContain("screen-share-started");
    expect(kinds).toContain("screen-share-stopped");
    session.stop();
  });

  it("stop() releases camera and screen so the OS indicator goes dark", async () => {
    const cam = captureStub("camera");
    const scr = captureStub("screen");
    h.startCameraCapture.mockImplementation(cam.stub);
    h.startScreenCapture.mockImplementation(scr.stub);

    const { session } = await liveSession({ camera: true });
    await session.startScreenShare();

    const camHandle = await cam.stub.mock.results[0].value;
    const scrHandle = await scr.stub.mock.results[0].value;
    session.stop();

    expect(camHandle.stop).toHaveBeenCalled();
    expect(scrHandle.stop).toHaveBeenCalled();
  });
});
