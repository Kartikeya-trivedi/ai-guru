import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [react()],

  /**
   * Key prefixes are exposed to the DEV SERVER ONLY.
   *
   * `vite build` inlines matching env vars into the bundle as string
   * literals, so listing them here unconditionally baked the developer's own
   * GEMINI_API_KEY into `dist/` — and from there into the shipped installer,
   * handing every customer a working key billed to us. Verified by scanning
   * a real release build; guarded now by scripts/check-bundle-secrets.mjs,
   * which runs as part of `npm run build`.
   *
   * Packaged builds have no env fallback by design: keys come from the OS
   * keychain via Tauri (see src/providers/keys.ts).
   */
  envPrefix: command === "serve" ? ["VITE_", "GEMINI_", "XAI_", "ELEVENLABS_"] : ["VITE_"],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
