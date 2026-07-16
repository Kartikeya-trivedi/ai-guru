# Product Plan

> Detailed plan and product thoughts from the owner to be merged in here.

## What we know so far

1. AI-based interview system, downloadable as an app, sold to customers.
2. Covers all interview topics, primarily tech-oriented.
3. DSA/coding interviews with support for multiple programming languages.
4. AI provider support: **Gemini** and **Grok** first-class, plus an open
   provider interface so customers can plug in other services (OpenAI,
   Anthropic, local models, etc.).

## Decisions

- **Form factor**: desktop app only.
- **API keys**: bring-your-own-key (BYOK). Customers supply their own
  Gemini/Grok/etc. keys; the app talks to providers directly. No metering
  infra on our side, and keys are stored locally (OS keychain).
- **Interview mode**: voice-to-voice, like a real interview. Target is
  human-feeling conversation at p95 — low response latency, natural turn
  taking, interruption (barge-in) support.

## Voice architecture (the core constraint)

Two ways to do voice, with very different feel:

1. **Pipeline (STT → LLM → TTS)** — ~1.5–3s latency, no natural
   interruptions. Does not feel human. Fallback only.
2. **Native realtime speech-to-speech** — bidirectional audio stream,
   sub-second first-audio, barge-in. This is the target experience.
   **Gemini Live API** supports this today and is the launch provider for
   realtime voice.

Provider abstraction therefore has two capability tiers:

- **Realtime voice providers** (Gemini Live first) — full human-like mode.
- **Text-only providers** (Grok and others) — served via the pipeline
  fallback with a pluggable STT/TTS layer, until they ship realtime APIs.

BYOK + desktop means audio streams device → provider directly with the
customer's key. No relay server of ours in the path (good for latency and
privacy).

## Code execution & judging (DSA rounds)

- **v1 default: AI-judged code.** The interviewer model reads the
  candidate's code, probes edge cases, discusses complexity — like a human
  interviewer. No execution infra needed.
- **v1.x: optional local "Run" support.** Execute candidate code on-device
  in a sandboxed subprocess (time/memory limits, no network) against test
  cases, using detected or bundled language runtimes. No Docker requirement.
- Rejected: remote judge APIs (Judge0-style) — per-execution costs and
  hosting burden don't fit a BYOK downloadable product.

## Open decisions (to settle when the detailed plan lands)

- **Desktop framework**: Electron vs. Tauri (both give mature web audio
  stacks; Tauri is lighter). Leaning Tauri, not final.
- **Licensing/distribution**: how customers buy, activate, and update.
- **Question bank**: bundled content vs. AI-generated on the fly vs. both.
- **Scoring/reports**: post-interview feedback, rubrics, exportable reports.
- **STT/TTS choices** for the text-only-provider fallback path.
