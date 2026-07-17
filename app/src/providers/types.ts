/**
 * Provider abstraction — BYOK, pluggable.
 *
 * Two capability tiers:
 *  - realtimeVoice: native bidirectional speech-to-speech (Gemini Live).
 *  - text: chat-completions style streaming (Grok, OpenAI-compatible, ...).
 * Text-only providers get voice via the STT → LLM → TTS fallback pipeline.
 */

export interface ProviderCapabilities {
  realtimeVoice: boolean;
  text: boolean;
}

export interface ProviderConfig {
  /** API key, resolved from the OS keychain at session start. */
  apiKey: string;
  /** Model id for this role, e.g. "gemini-2.5-flash-native-audio". */
  model: string;
  /** Base URL override — required for openai-compat, optional elsewhere. */
  baseUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Streaming text channel (chat-completions style). */
export interface TextChannel {
  send(messages: ChatMessage[]): AsyncIterable<string>;
  close(): void;
}

export type VoiceEvent =
  | { type: "audio"; frame: ArrayBuffer } // provider → speaker
  | { type: "transcript"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "interrupted" } // user barge-in acknowledged; stop playback
  | { type: "turn-complete" }
  | { type: "error"; message: string };

/** Bidirectional realtime voice channel with barge-in support. */
export interface RealtimeVoiceChannel {
  /** Push a mic audio frame (PCM16, provider-specified sample rate). */
  sendAudio(frame: ArrayBuffer): void;
  /** Update the system/context instructions mid-session (stage changes). */
  updateContext(instructions: string): void;
  events(): AsyncIterable<VoiceEvent>;
  close(): void;
}

export interface Provider {
  id: string;
  displayName: string;
  capabilities: ProviderCapabilities;
  text(config: ProviderConfig): TextChannel;
  voice?(config: ProviderConfig): Promise<RealtimeVoiceChannel>;
}
