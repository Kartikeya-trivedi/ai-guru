/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only. Production reads keys from the OS keychain via Tauri. */
  readonly GEMINI_API_KEY?: string;
  readonly XAI_API_KEY?: string;
  readonly ELEVENLABS_API_KEY?: string;
  readonly SIMLI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
