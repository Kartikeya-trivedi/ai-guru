# Interview System

An AI-powered interview platform, distributed as a downloadable app and sold to customers.

## Vision

- **AI-driven interviews** for all topics, with a primary focus on tech interviews.
- **DSA / coding interviews** with multi-language support (write and evaluate solutions in the candidate's language of choice).
- **Pluggable AI providers** — Gemini and Grok supported first, with a provider abstraction so any other AI service can be added.
- **Commercial product** — packaged, licensed, and downloadable by customers.

## Status

Early bootstrap. Detailed product plan and architecture are being drafted in [docs/](docs/).

## Repository layout

```
docs/       Product plan (PLAN.md) and system design (ARCHITECTURE.md)
app/        Tauri 2 + React + TypeScript desktop app
  src/
    engine/     interview stage machine, Socratic depth controller
    providers/  pluggable AI provider layer (Gemini, Grok, OpenAI-compat)
    resume/     resume parsing — the interviewer's memory
    report/     structured evaluation report
  src-tauri/    Rust shell (keychain, SQLite, window)
```

## Development

```
cd app
npm install
npm run tauri dev
```
