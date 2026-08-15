import { SimliClient, generateSimliSessionToken, generateIceServers } from "simli-client";
import { toAvatarAudio } from "./resample";

/**
 * Photoreal talking head via Simli.
 *
 * Simli is audio-driven: we push the interviewer's actual Gemini voice and it
 * returns a lip-synced video stream. That direction matters — a text-driven
 * avatar service would run its own TTS, replacing the voice we chose and
 * throwing away the measured 544 ms response latency.
 *
 * AUDIO OWNERSHIP. When this is active, Simli plays the audio, not our local
 * sink. Lip sync only holds if one pipeline emits both streams; playing
 * locally while Simli renders video independently guarantees visible drift.
 * The cost is real and unavoidable: Simli buffers audio to generate frames,
 * so replies land later than on the voice-only path. Photoreal costs latency.
 *
 * FAILURE POSTURE. Every failure here is non-fatal. An avatar service that is
 * down, rate-limited or unreachable must never end someone's interview — the
 * caller falls back to the local stylised face and local audio.
 */

export interface PhotorealAvatar {
  /** Push interviewer audio (provider-native rate) to drive the mouth. */
  pushAudio(chunk: ArrayBuffer, sampleRate: number): void;
  /** Barge-in: drop queued audio so the face stops mid-word, like a person. */
  interrupt(): void;
  close(): void;
  /** False once the session has dropped, so the UI can fall back. */
  isConnected(): boolean;
}

/** Simli library face used when the user hasn't chosen one. */
export const DEFAULT_FACE_ID = "tmp9i8bbq7c";

export interface OpenAvatarOptions {
  apiKey: string;
  /** Which face to render; Simli exposes a library of face IDs. */
  faceId?: string;
  /** Where Simli renders video and audio. The SDK requires both. */
  videoEl: HTMLVideoElement;
  audioEl: HTMLAudioElement;
  /** Called if the session drops after connecting, so the UI can fall back. */
  onDropped?: (reason: string) => void;
  /** Fired when the face starts/stops talking — drives the UI "on air" state. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** How long to wait for the first connection before giving up. */
  connectTimeoutMs?: number;
}

export async function openSimliAvatar(opts: OpenAvatarOptions): Promise<PhotorealAvatar> {
  // The session token is minted from the API key. With BYOK the key already
  // lives on this machine, so there is no server to broker it through.
  const { session_token } = await generateSimliSessionToken({
    apiKey: opts.apiKey,
    config: {
      faceId: opts.faceId || DEFAULT_FACE_ID,
      // Idle the face when we send nothing, so it breathes and blinks between
      // questions instead of freezing on its last frame.
      handleSilence: true,
      // An interview can run an hour; SDK defaults are far shorter and would
      // drop the face partway through.
      maxSessionLength: 3600,
      maxIdleTime: 600,
    },
  });

  const iceServers = await generateIceServers(opts.apiKey);

  const client = new SimliClient(
    session_token,
    opts.videoEl,
    opts.audioEl,
    iceServers,
  );

  let connected = false;

  client.on("error", (detail) => {
    if (!connected) return;
    connected = false;
    opts.onDropped?.(detail || "The avatar disconnected.");
  });
  client.on("stop", () => {
    if (!connected) return;
    connected = false;
    opts.onDropped?.("The avatar session ended.");
  });
  // Simli knows precisely when the face is talking; that beats inferring it
  // from transcript chunks arriving.
  client.on("speaking", () => opts.onSpeakingChange?.(true));
  client.on("silent", () => opts.onSpeakingChange?.(false));

  // start() resolves once the WebRTC session is up. Race it against a timeout
  // so a hung third party can never hold the interview hostage.
  await Promise.race([
    client.start(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("The avatar service didn't respond in time.")),
        opts.connectTimeoutMs ?? 10_000,
      ),
    ),
  ]);

  connected = true;

  return {
    pushAudio(chunk: ArrayBuffer, sampleRate: number): void {
      if (!connected) return;
      try {
        client.sendAudioData(toAvatarAudio(chunk, sampleRate));
      } catch {
        // A dropped frame is a cosmetic glitch; never surface it as an error.
      }
    },

    interrupt(): void {
      if (!connected) return;
      try {
        client.ClearBuffer();
      } catch {
        /* the face catches up on the next turn */
      }
    },

    isConnected: () => connected,

    close(): void {
      connected = false;
      void client.stop().catch(() => {
        /* already gone */
      });
    },
  };
}
