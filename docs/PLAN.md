# Product Plan

## The problem

Most interview prep tools fail because they:

- ask random questions,
- don't understand the candidate's resume,
- don't behave like a real interviewer,
- don't create real interview pressure.

Goal: something people **pay for**, not a resume project.

## The product vision

An AI interviewer that behaves like a **senior interviewer** (tech-focused,
ML/SWE/DSA first, extensible to other domains).

The candidate uploads their resume. The AI:

1. reads and understands the resume,
2. interviews them **over voice**,
3. adapts questions based on answers,
4. drills deeper when answers are good,
5. generates an evaluation report at the end.

**Core philosophy ("care"):** design the interview the way an experienced
human interviewer would run it *first* — then use AI to faithfully reproduce
that process. Don't just generate questions.

## The interview structure

Not random questions — a staged flow:

1. Tell me about yourself
2. Resume discussion
3. Deep dive into projects
4. Technical questions (incl. DSA/coding rounds, multi-language)
5. Behavioral questions
6. Final report

## The differentiator: Socratic deep-dive

The interviewer **digs deeper** ("Russian Doll" questioning). Every answer
opens another layer until the candidate reaches the limit of their
understanding:

> Tell me about your project. → Why that architecture? → Why not X?
> → What failed? → How did you debug it? → What trade-offs did you make?

This adaptive drilling is the main product differentiator and is a
first-class concept in the interview engine, not a prompt afterthought.

## Resume as the interviewer's memory

The resume isn't just uploaded — it is parsed, broken into structured
sections (experience, projects, skills, education), and stored locally so
the interviewer can reference any project or experience naturally at any
point in the conversation.

> Deviation from the original lecture notes: the lecture stored resume data
> in Supabase (web-app context). This is a **desktop, BYOK, local-first**
> product, so resume/session data lives in **local SQLite** — same role
> ("interviewer's memory"), better privacy, works offline, no infra to run.
> Supabase can enter later for accounts/licensing/sync if needed.

## Voice

Typing isn't enough — a real interview has hesitation, pressure, anxiety,
and tests speaking ability. Voice-to-voice, targeting human-feeling
conversation at p95 (low latency, natural turn-taking, barge-in).

- **Primary: native realtime speech-to-speech** — Gemini Live API at launch.
- **Fallback pipeline (STT → LLM → TTS)** for text-only providers (Grok and
  others): pluggable STT and realistic TTS (ElevenLabs or similar, BYOK).

## Final output: the report

Not "8/10". A structured evaluation covering:

- project depth
- technical knowledge
- behavioral fit
- communication
- strengths / weaknesses
- interview readiness
- actionable improvements

## Decisions (settled)

- **Form factor**: desktop app only — **Tauri 2 + React + TypeScript**.
- **API keys**: BYOK; keys stored in the OS keychain; app talks to
  providers directly (no relay server — latency + privacy win).
- **Providers**: Gemini and Grok first; open provider interface for others.
  Two capability tiers: realtime-voice vs text-only (pipeline fallback).
- **Storage**: local SQLite (resume sections, sessions, transcripts,
  reports).
- **DSA judging**: v1 = AI-judged conversationally (like a real
  interviewer); v1.x = optional local sandboxed "Run" against test cases.

## Open decisions

- Licensing/distribution: purchase, activation, updates.
- Question bank: bundled vs AI-generated vs both.
- Exact STT/TTS picks for the fallback pipeline.
- Report export formats (PDF at minimum).
