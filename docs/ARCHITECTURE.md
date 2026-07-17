# Architecture

Desktop app: **Tauri 2** (Rust shell) + **React + TypeScript** (UI and all
domain logic). Rust is kept thin — window, OS keychain, SQLite, file
dialogs, (later) sandboxed code execution. Everything product-shaped lives
in TypeScript.

```
┌──────────────────────────── Tauri window ────────────────────────────┐
│  React UI                                                            │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────────┐  │
│  │ Setup/Resume│ │ Interview    │ │ Code editor│ │ Report view    │  │
│  │ upload      │ │ room (voice) │ │ (DSA)      │ │                │  │
│  └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ └───────┬────────┘  │
│         │               │               │                │           │
│  ┌──────▼───────────────▼───────────────▼────────────────▼────────┐  │
│  │                    Interview Engine (TS)                       │  │
│  │  stage machine · Socratic depth controller · candidate model   │  │
│  └──────┬──────────────────────┬──────────────────────┬───────────┘  │
│  ┌──────▼───────┐   ┌──────────▼──────────┐   ┌───────▼──────────┐   │
│  │ Resume       │   │ Provider layer      │   │ Report generator │   │
│  │ pipeline     │   │ realtime + text     │   │                  │   │
│  └──────┬───────┘   │ tiers, BYOK         │   └───────┬──────────┘   │
│         │           └──────────┬──────────┘           │              │
└─────────┼──────────────────────┼──────────────────────┼──────────────┘
          │ Tauri IPC            │ WebSocket/HTTPS      │ Tauri IPC
   ┌──────▼───────┐       ┌──────▼──────┐        ┌──────▼───────┐
   │ SQLite       │       │ Gemini Live │        │ SQLite +     │
   │ (local)      │       │ Grok, ...   │        │ PDF export   │
   └──────────────┘       └─────────────┘        └──────────────┘
```

## 1. Interview Engine — the heart of the product

Models the interview the way a senior interviewer runs it. Two cooperating
pieces:

### Stage machine

The six stages (intro → resume discussion → project deep-dive → technical →
behavioral → wrap-up/report) as an explicit state machine, not a prompt.
Each stage owns:

- entry criteria and target duration,
- what the interviewer is trying to *learn* in this stage,
- exit criteria (learned enough / time budget spent).

### Socratic depth controller

The differentiator. For each answer, the engine (via a fast LLM call)
assesses: was the answer strong, shallow, evasive, wrong? Then it decides:

- **strong** → drill one layer deeper (why this architecture? what failed?
  what trade-offs?) — up to a per-topic depth budget,
- **shallow/struggling** → probe once more gently, then move laterally,
- **exhausted** → surface to the next topic/stage.

Each drill-down is tracked as a `Thread` (topic, depth reached, quality of
answers) — this becomes the raw material for the report.

### Candidate model

A running structured summary of what the interview has revealed (claims
made, verified strengths, exposed gaps), updated after each exchange and
injected into the interviewer's context. This is what makes stage 4
questions reference stage 2 answers naturally.

## 2. Resume pipeline

`PDF/DOCX → text extraction → LLM structuring → SQLite`

Parsed into typed sections: contact, summary, experience[], projects[],
skills[], education[]. Stored locally; the engine pulls relevant sections
into context per stage (whole resume is small enough to include, but
structured sections let the engine *target* — e.g. pick the two most
technically interesting projects for stage 3).

## 3. Provider layer (BYOK, pluggable)

```ts
interface Provider {
  id: string
  capabilities: { realtimeVoice: boolean; text: boolean }
  text(session): TextChannel               // chat-completions style, streaming
  voice?(session): RealtimeVoiceChannel    // bidirectional audio, barge-in
}
```

- **Gemini**: realtimeVoice (Live API, WebSocket, native speech-to-speech)
  + text. Launch flagship for the human-like p95 experience.
- **Grok**: text tier → voice via the fallback pipeline
  (pluggable STT → Grok → pluggable TTS e.g. ElevenLabs, also BYOK).
- **Others**: anyone implementing `Provider` plugs in; config-driven
  OpenAI-compatible adapter covers most text providers for free.

Keys: entered in settings → stored in **OS keychain** via Rust
(never in SQLite, never in config files). All provider traffic goes
device → provider directly.

Two model roles per session, independently configurable:
- **conversation model** (realtime voice, does the interviewing),
- **reasoning model** (cheap/fast text calls: answer assessment, candidate
  model updates, report generation). Can be the same provider or different.

## 4. Voice layer

- Mic capture + playback via Web Audio in the webview.
- `RealtimeVoiceChannel` abstracts: push mic frames, receive audio frames,
  interruption events (user barge-in cancels TTS/generation), and parallel
  text transcripts (needed for the transcript log + candidate model).
- Latency budget (p95): capture→provider ≤ 100ms, provider first-audio
  ≤ 800ms, playback start ≤ 100ms.

## 5. DSA / coding rounds

- In-app code editor (Monaco) with language selector.
- v1: code is sent to the reasoning model; interviewer discusses it over
  voice (complexity, edge cases, bugs) — Socratic controller applies.
- v1.x: "Run" button → Rust side executes in a resource-limited sandboxed
  subprocess (time/memory caps, no network) against test cases.

## 6. Report generator

Consumes: full transcript, all `Thread`s (topics × depth × quality), the
candidate model, and code artifacts. Produces the structured report
(project depth, technical knowledge, behavioral fit, communication,
strengths, weaknesses, readiness, actionable improvements) → stored in
SQLite, rendered in-app, exportable to PDF.

## 7. Data (SQLite, local)

```
resumes(id, raw_text, parsed_json, created_at)
sessions(id, resume_id, config_json, started_at, ended_at)
turns(id, session_id, role, text, audio_meta, stage, ts)
threads(id, session_id, topic, depth, quality_json)
reports(id, session_id, report_json, created_at)
```

## Repo layout

```
app/                  Tauri + React application
  src/                React UI + domain logic (TS)
    engine/           stage machine, depth controller, candidate model
    providers/        Provider interface + gemini/, grok/, openai-compat/
    resume/           parsing pipeline
    report/           report generation + rendering
    voice/            audio capture/playback, channel abstractions
    db/               SQLite access (via tauri-plugin-sql)
  src-tauri/          Rust shell: keychain, sql plugin, (later) sandbox
docs/                 this file, PLAN.md
```
