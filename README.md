# Interview System

An AI interviewer that behaves like a senior engineer — reads your resume,
interviews you over voice, drills until it finds the edge of what you know,
and writes you an honest evaluation.

Desktop app. Bring your own API keys. Files are stored locally; interview
content is processed by your selected AI providers.

## Why this exists

Most interview prep asks random questions, ignores your resume, and doesn't
create any of the pressure that makes real interviews hard. This does the
opposite:

- **Your resume is the interviewer's memory**, not an attachment. It's parsed
  into structured sections and the probe angles are worked out *before* you
  speak — the way a real interviewer arrives having read it.
- **Voice, not typing.** Hesitation, pressure, and speaking ability are part
  of what's being tested. A short text-to-audio spike measured **544 ms** to first response, with
  barge-in — you can cut it off mid-sentence like a real conversation.
- **It digs.** Answer well and it goes a layer deeper. Answer vaguely and it
  gives you one fair chance, then moves on. Hit your genuine limit and it
  eases off rather than grinding you down.
- **Reasoning over recall.** Deriving an answer imperfectly from first
  principles scores higher than reciting a correct definition. Saying "I
  don't know" plainly is treated as a strength, not evasion.
- **A report you can act on**, grounded in evidence — not a score out of ten.

## Download

**[Releases](https://github.com/Kartikeya-trivedi/ai-guru/releases)** — Windows
installer. (Linking the list rather than `/latest`, which GitHub resolves only
to stable releases and would 404 while this is still in beta.)

It is not code-signed yet, so SmartScreen will warn on first run
("More info" then "Run anyway"). You need a Google Gemini API key **with
billing enabled**; a free-tier key runs out partway through an interview.

## Status

Public beta. Voice, resume pipeline, interview engine, DSA rounds, reports,
video/screen share, and BYOK settings are built. See
[docs/PRD.md](docs/PRD.md) for scope and
[docs/VALIDATION.md](docs/VALIDATION.md) for what's actually been measured
versus assumed.

Honest about what is not settled: the installer is unsigned, the realtime
voice model is a `-preview` one that Google can retire, and while the app has
been driven through interviews in the dev shell, it has not yet been through a
sustained human feel-test on the installed build — which is the one thing that
decides whether any of this works.

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

Resume text, job descriptions, transcripts, and relevant interview evidence
are also sent to the configured AI providers for parsing, interviewing, and
evaluation. Optional camera/screen frames go to the voice provider. The default
fictional human face is bundled locally and needs no avatar service; its mouth
follows speaker audio, with blinks and subtle expressions. This lightweight rig
does not recognise phonemes. Streamed neural lip-sync remains an explicit
optional choice. See [local face implementation](docs/LOCAL-FACE.md).
