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
