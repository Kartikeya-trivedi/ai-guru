import type { VideoSource } from "../providers/types";

/**
 * Camera and screen capture → JPEG stills for the interviewer's vision.
 *
 * Why stills and not a video stream: the Live API takes individual images on
 * `realtimeInput.video`, capped at 1 frame/second. We deliberately sample far
 * BELOW that cap — a human interviewer glances at you, they do not stare at
 * 1fps. Every frame costs tokens and bloats the context window (which then
 * evicts earlier conversation under sliding-window compression), so the
 * default intervals below trade "sees enough to react" against "does not
 * drown the session in pixels".
 *
 * Frames are downscaled before encoding: a 4K screen share encoded raw would
 * be megabytes per frame for no gain, since the model only needs to read text
 * and see gross layout.
 */

export interface VideoCaptureOptions {
  /** Milliseconds between frames. Floored at 1000 — the API's hard cap. */
  intervalMs?: number;
  /** Longest edge, in pixels, after downscaling. */
  maxEdge?: number;
  /** JPEG quality, 0..1. */
  quality?: number;
}

export interface VideoCapture {
  /** The live stream, for rendering a self-view / share preview in the UI. */
  stream: MediaStream;
  source: VideoSource;
  /** True once the underlying track ends (user clicked "Stop sharing"). */
  ended(): boolean;
  stop(): void;
}

const DEFAULTS: Record<VideoSource, Required<VideoCaptureOptions>> = {
  // The candidate's face changes slowly; 3s is plenty to catch presence,
  // engagement and gross body language without burning tokens.
  camera: { intervalMs: 3000, maxEdge: 640, quality: 0.7 },
  // Screen frames matter most while code is being written, and text needs
  // more pixels to stay legible — but a slower cadence, since a screen is
  // mostly static between edits.
  screen: { intervalMs: 5000, maxEdge: 1280, quality: 0.8 },
};

/** True when the browser/webview can capture a screen at all. */
export function screenCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Turn a raw capture failure into something the candidate can act on. */
export function translateCaptureError(e: unknown, source: VideoSource): Error {
  const name = e instanceof DOMException ? e.name : "";
  const what = source === "camera" ? "camera" : "screen";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new Error(
      source === "camera"
        ? "Camera access was blocked. Allow it in your browser or system settings, or continue with voice only."
        : "Screen sharing was cancelled or blocked. You can continue without it.",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new Error(`No ${what} was found on this machine.`);
  }
  if (name === "NotReadableError") {
    return new Error(`Your ${what} is in use by another app. Close it and try again.`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

async function startFromStream(
  stream: MediaStream,
  source: VideoSource,
  onFrame: (jpeg: ArrayBuffer, source: VideoSource) => void,
  options: VideoCaptureOptions,
): Promise<VideoCapture> {
  const cfg = { ...DEFAULTS[source], ...options };
  // The API rejects anything faster than 1fps; clamp rather than let a caller
  // silently get throttled or errored server-side.
  const intervalMs = Math.max(1000, cfg.intervalMs);

  // An offscreen <video> is the only reliable way to get decoded frames we can
  // draw; playsInline+muted keeps mobile webviews from hijacking it fullscreen.
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {
    /* autoplay policies: the stream is live regardless, frames still decode */
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let stopped = false;
  let trackEnded = false;

  // "Stop sharing" from the browser's own UI ends the track without telling
  // us through any callback we control — watch the track directly.
  for (const track of stream.getVideoTracks()) {
    track.addEventListener("ended", () => {
      trackEnded = true;
    });
  }

  const grab = async (): Promise<void> => {
    if (stopped || trackEnded || !ctx) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    // Before the first frame decodes, dimensions are 0 — skip, don't crash.
    if (!w || !h) return;

    const scale = Math.min(1, cfg.maxEdge / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", cfg.quality),
    );
    if (!blob || stopped) return;
    onFrame(await blob.arrayBuffer(), source);
  };

  const timer = setInterval(() => void grab(), intervalMs);

  return {
    stream,
    source,
    ended: () => trackEnded,
    stop() {
      stopped = true;
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

/** Candidate's webcam. Audio is NOT requested here — the mic is already owned. */
export async function startCameraCapture(
  onFrame: (jpeg: ArrayBuffer, source: VideoSource) => void,
  options: VideoCaptureOptions = {},
): Promise<VideoCapture> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    return await startFromStream(stream, "camera", onFrame, options);
  } catch (e) {
    throw translateCaptureError(e, "camera");
  }
}

/** Screen / window share. The picker is shown by the browser, not by us. */
export async function startScreenCapture(
  onFrame: (jpeg: ArrayBuffer, source: VideoSource) => void,
  options: VideoCaptureOptions = {},
): Promise<VideoCapture> {
  if (!screenCaptureSupported()) {
    throw new Error("Screen sharing isn't available in this app build.");
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5 } },
      audio: false,
    });
    return await startFromStream(stream, "screen", onFrame, options);
  } catch (e) {
    throw translateCaptureError(e, "screen");
  }
}
