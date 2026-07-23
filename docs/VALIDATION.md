# Validation log

Evidence for the gates in [PRD.md](PRD.md). Claims here are measured, not
assumed — re-run the harnesses before trusting them after a provider change.

## Phase 1 — voice spike (go/no-go for the product)

**Gate:** conversation must feel human. Target **p95 first-audio < 800 ms**.

### Model selection — measured, not assumed

`node app/scripts/validate-gemini-live.mjs` drives the real Live API
(setup → text turn → native audio reply) and measures time-to-first-audio:

| Model | Setup | Audio out | Time-to-first-audio | Verdict |
|-------|-------|-----------|--------------------|---------|
| `gemini-3.1-flash-live-preview` | ✅ | ✅ 24 kHz PCM16 | **544 ms** | **PASS** — under budget |
| `gemini-2.5-flash-native-audio-preview-12-2025` | ✅ | ✅ 24 kHz PCM16 | 1813 ms | FAIL — reads as robotic |

→ **Launch model: `gemini-3.1-flash-live-preview`.** The 2.5 native-audio
model is >2× the latency budget; it is not a viable fallback for the
realtime path.

Also confirmed by this harness: API key valid, input/output transcription
delivered (needed for the transcript log, candidate model, and report),
output is 24 kHz (parsed per chunk from the mimeType rather than hardcoded).

### Audio path — verified with synthetic audio (no mic needed)

`window.runAudioSelfTests()` (dev builds) drives the real Web Audio graph
with a synthetic 440 Hz stream:

| Test | Result |
|------|--------|
| Capture pipeline | PASS — 23 frames, 640 B each (= 320 samples = 20 ms @ 16 kHz PCM16), tone present, level meter live |
| Playback + barge-in flush | PASS — queued audio plays; `flush()` goes silent immediately, not after the queue drains |

### Browser path

`openGeminiLive()` resolves from the browser (Vite dev at :1420) before the
mic call — proving the WebSocket handshake, key injection, and setup
complete in a real page context, not just Node.

### Human feel-test — PASSED (2026-07-16)

Owner ran the live spike in Chrome with a headset: real mic capture, real
multi-turn conversation, barge-in. Verdict: **"works extremely fine"** — no
robotic feel, no barge-in lag, latency not perceptible as waiting.

This was the one gate no harness could settle. It is the reason the product
is viable.

### Still open

- **Tauri/WebView2 microphone access** on the packaged desktop app.
  Validated in Chrome, not yet in the Tauri window. Known upstream pain
  point ([tauri#12547](https://github.com/tauri-apps/tauri/issues/12547),
  [tauri#5042](https://github.com/tauri-apps/tauri/issues/5042)): some apps
  never prompt at all. **This is a foundational risk, not polish** — voice
  is the product, and if WebView2 can't reliably grant a mic, the
  Tauri-over-Electron decision is wrong. Must be settled before Phase 4,
  not deferred to hardening.
- p95 across a long (>30 min) session — spike runs were short.

**Status: Phase 1 gate PASSED**, measured *and* subjectively. 544 ms leaves
~250 ms of headroom for engine work in the loop.

## Phase 2 — resume as memory (in progress)

`node app/scripts/validate-resume-parse.mjs` runs the real pipeline
(PDF → text → structured memory) over real resumes in `testdata/`.

### Extraction

| Resume | Extracted | Result |
|--------|-----------|--------|
| Sample 1 | 3,069 chars / 49 lines | PASS |
| Sample 2 | 3,600 chars / 71 lines | PASS |

pdf.js emits positioned fragments, not lines; we rebuild lines by Y-position
and sort fragments by X. Section headings and bullets survive, which matters
because the model parses `PROJECTS\n- X` far more reliably than fragment soup.

### Structuring

Both resumes: name, experience, projects, skills, education all extracted;
**every project got ≥2 probe angles**. Spot-check of quality — these are the
questions the product's differentiator depends on:

> *"2.7x cuBLAS fp32 (int4 matmul): How was this benchmarked? What were the
> specific hardware and software configurations for both your implementation
> and the cuBLAS baseline?"*

> *"Says 'three-layer security model' — what are the layers, why that
> specific architecture, and what alternatives were considered?"*

These are genuinely senior-interviewer questions, not generic prompts. The
"resume as memory, with probe angles precomputed" design works.

### Findings that changed the code

1. **`gemini-3.5-flash` returned 503 on every attempt** (4 retries, both
   resumes) while `gemini-2.5-flash` served the same work fine. Not
   transient — the model is saturated for this free-tier key. A BYOK product
   cannot hard-fail on this, so `geminiGenerateWithModel` now retries with
   exponential backoff + jitter and then **falls through a model chain**
   (`REASONING_FALLBACKS`). Non-retryable statuses (e.g. 400) do *not*
   fall through — they'd fail identically on every model and just burn quota.
2. **Structuring took ~15-20 s** (26 s including the failed 3.5 retries).
   Fine for a one-time upload. **Not fine for in-interview answer
   assessment**, which runs while the candidate is talking. Phase 3 must
   measure assessment latency separately and likely use a smaller model
   (`gemini-2.5-flash-lite`) with a much tighter output schema.
   → Resolved in Phase 3 below: flash-lite at ~1.9 s.

## Phase 3 — assessment: latency and judgement

`node app/scripts/validate-assessment.mjs` grades five fixture answers whose
correct verdicts a senior interviewer would agree on. The fixtures are built
to catch a grader that rewards *fluency* — `fluent-but-shallow` name-drops
vLLM instead of explaining, `fluent-evasion` agrees the problem is hard and
never answers, `confident-and-wrong` states falsehoods with total assurance.

### Result (after the honesty fix below)

| Model | Judgement | avg | p50 | max |
|-------|-----------|-----|-----|-----|
| **`gemini-2.5-flash-lite`** | **5/5** | **1866 ms** | 1333 ms | 3659 ms |
| `gemini-2.5-flash` | 5/5 | 4542 ms | 4329 ms | 6692 ms |

→ **Assessment model: `gemini-2.5-flash-lite`.** Identical accuracy at 2.4×
the speed; the larger model buys nothing on this task.

Latency is acceptable because assessment is **off the critical path** — see
"steering" in [ARCHITECTURE.md](ARCHITECTURE.md). It never delays the
interviewer's reply; it steers the following turn.

### The finding that changed the prompt

First run, flash-lite scored **4/5**: it labelled an honest *"I don't know,
I tuned occupancy empirically"* as **evasive**.

Behaviourally this was harmless — it still set `atKnowledgeLimit`, so the
depth controller moved on correctly. But the quality label feeds the
**report**, and marking honesty as evasion would produce an unjust
evaluation of a real person — punishing precisely the behaviour a good
interview should reward. That is a product failure, not a metric failure.

The prompt now draws the line explicitly: *"Saying 'I don't know' plainly is
NOT evasive. Evasion is pretending to answer."*

Result: flash-lite went to **5/5** and now grades that answer *adequate,
atKnowledgeLimit=true* with a fair note. **The fairness fix is also what made
the cheap model good enough** — caring about the candidate and cutting cost
turned out to be the same edit.
