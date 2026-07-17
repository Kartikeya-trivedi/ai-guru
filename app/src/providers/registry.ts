import type { Provider } from "./types";

/**
 * Provider registry. Built-ins register here; the openai-compat adapter
 * lets users add any OpenAI-compatible endpoint from settings without code.
 */
const providers = new Map<string, Provider>();

export function registerProvider(p: Provider): void {
  providers.set(p.id, p);
}

export function getProvider(id: string): Provider {
  const p = providers.get(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function listProviders(): Provider[] {
  return [...providers.values()];
}
