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

### Not yet validated (needs a human + headset)

- Physical mic capture through a real device.
- **Subjective feel**: does the interviewer sound human, does barge-in feel
  natural mid-sentence, is echo cancellation sufficient on speakers?
- p95 across a full multi-turn conversation (the harness measures single
  turns; `LatencyTracker` in the app records live p50/p95 during a session).

**Status: Phase 1 gate PASSED on the measurable criteria.** The 544 ms
result clears the budget with ~250 ms of headroom for engine work in the
loop. Human feel-test remains outstanding but is not blocking Phase 2.

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
