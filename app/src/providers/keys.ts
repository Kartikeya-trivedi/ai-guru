import { invoke } from "@tauri-apps/api/core";

/**
 * BYOK key access.
 *
 * In the packaged app keys live in the OS credential store, reached through
 * Rust. In a plain browser dev session there is no keychain, so we fall back
 * to app/.env — dev-only, and never a path the shipped app takes.
 */

const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type ProviderId = "gemini" | "xai" | "elevenlabs";

const ENV_FALLBACK: Record<ProviderId, string | undefined> = {
  gemini: import.meta.env.GEMINI_API_KEY,
  xai: import.meta.env.XAI_API_KEY,
  elevenlabs: import.meta.env.ELEVENLABS_API_KEY,
};

export async function getKey(provider: ProviderId): Promise<string | null> {
  if (!isTauri()) return ENV_FALLBACK[provider] ?? null;
  return (await invoke<string | null>("get_api_key", { provider })) ?? null;
}

export async function setKey(provider: ProviderId, key: string): Promise<void> {
  if (!isTauri()) throw new Error("Keys can only be saved in the desktop app.");
  await invoke("set_api_key", { provider, key });
}

export async function deleteKey(provider: ProviderId): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_api_key", { provider });
}

export async function hasKey(provider: ProviderId): Promise<boolean> {
  if (!isTauri()) return Boolean(ENV_FALLBACK[provider]);
  return invoke<boolean>("has_api_key", { provider });
}

/** True when running in the desktop shell (keychain + code execution exist). */
export const inDesktopApp = isTauri;
