# Product Plan

> Placeholder — the detailed plan and product thoughts go here.

## What we know so far

1. AI-based interview system, downloadable as an app, sold to customers.
2. Covers all interview topics, primarily tech-oriented.
3. DSA/coding interviews with support for multiple programming languages.
4. AI provider support: **Gemini** and **Grok** first-class, plus an open
   provider interface so customers can plug in other services (OpenAI,
   Anthropic, local models, etc.).

## Open decisions (to settle when the detailed plan lands)

- **App form factor**: desktop (Electron/Tauri), mobile, or both?
- **Tech stack**: frontend framework, backend/local-first, database.
- **Licensing/distribution**: how customers buy, activate, and update.
- **API key model**: bring-your-own-key vs. bundled/metered keys.
- **Code execution**: how candidate code is run and judged (sandboxing).
- **Voice/video**: is the interview text-only, voice, or video-based?
