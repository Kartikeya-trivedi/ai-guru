# Interview System

An AI interviewer that behaves like a senior engineer — reads your resume,
interviews you over voice, drills until it finds the edge of what you know,
and writes you an honest evaluation.

Desktop app. Bring your own API keys. Everything stays on your machine.

## Why this exists

Most interview prep asks random questions, ignores your resume, and doesn't
create any of the pressure that makes real interviews hard. This does the
opposite:

- **Your resume is the interviewer's memory**, not an attachment. It's parsed
  into structured sections and the probe angles are worked out *before* you
  speak — the way a real interviewer arrives having read it.
- **Voice, not typing.** Hesitation, pressure, and speaking ability are part
  of what's being tested. Measured at **544 ms** to first response, with
  barge-in — you can cut it off mid-sentence like a real conversation.
- **It digs.** Answer well and it goes a layer deeper. Answer vaguely and it
  gives you one fair chance, then moves on. Hit your genuine limit and it
  eases off rather than grinding you down.
- **Reasoning over recall.** Deriving an answer imperfectly from first
  principles scores higher than reciting a correct definition. Saying "I
  don't know" plainly is treated as a strength, not evasion.
- **A report you can act on**, grounded in evidence — not a score out of ten.

## Status

V1 in progress. Voice, resume pipeline, interview engine, DSA rounds,
reports, and BYOK settings are built. See [docs/PRD.md](docs/PRD.md) for
scope and [docs/VALIDATION.md](docs/VALIDATION.md) for what's actually been
measured versus assumed.

Known open risk: microphone access in the packaged Tauri/WebView2 window is
validated in Chrome but not yet in the desktop shell.

## Running it

Full instructions — prerequisites, keys, dev vs. desktop, building the
installer, troubleshooting — are in [docs/SETUP.md](docs/SETUP.md). The short
version:

```bash
cd app
npm install
cp .env.example .env      # then set GEMINI_API_KEY (browser dev only)
npm run tauri dev         # desktop app; enter the key in Settings
```

Get a Gemini key at [aistudio.google.com](https://aistudio.google.com) and
**enable billing** — the free tier can't finish one interview.

**Use headphones** — on speakers the interviewer hears itself and interrupts
itself.

```bash
npm test                                  # unit tests
node scripts/validate-gemini-live.mjs     # voice latency against the real API
node scripts/validate-assessment.mjs      # grading judgement + latency
node scripts/validate-resume-parse.mjs    # resume pipeline (needs testdata/)
```

## How it's built

```
app/
  src/
    engine/     stage machine, Socratic depth controller, persona, session
    providers/  BYOK provider layer (Gemini live + text), keychain access
    resume/     PDF extraction, structuring into interviewer memory
    dsa/        problem bank, test harness, hybrid judging
    report/     evidence-grounded evaluation
    voice/      mic capture, interruptible playback, latency metrics
    db/         local SQLite
    ui/         React front end
  src-tauri/    Rust shell: keychain, SQLite, code execution
docs/           PLAN · PRD · ARCHITECTURE · VALIDATION · REQUIREMENTS
```

Two model roles per session: a **realtime voice model** does the
interviewing, and a cheap **reasoning model** grades answers and writes the
report. Both are configurable; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

Your resume, transcripts, and reports live in a local SQLite database. API
keys go to your OS credential manager, never to disk in this app. Audio
streams directly from your machine to the provider your key pays for — there
is no server of ours in the path.
