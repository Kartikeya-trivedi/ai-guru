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

## Phase 4 — DSA problem bank

### Is the test data correct?

Wrong expected values fail a candidate's *correct* solution — the worst bug
this product can ship. "The author checked it" is not evidence, so the data
is verified by execution, twice over:

1. **In-repo harness** (`src/dsa/problems.verify.test.ts`, runs in
   `npm test`, no network): reference solutions for all 30 problems, plus
   independent brute-force cross-checks for the 14 subtlest — written from
   the *statement* rather than the fast algorithm, so a shared conceptual
   error can't pass both. **77/77 passed.**
2. **Independent model-written references** (`scripts/validate-problems.mjs`):
   a model writes a solution from each statement alone, never seeing expected
   outputs, and it is executed against our data. **6/30 verified** before the
   API quota ran out (below). The in-repo harness is therefore the primary
   durable check; this script is a second opinion when quota allows.

Structural checks pass: 30 unique ids; topics 6/5/5/5/4/5 across
arrays-strings, hashing, two-pointers, trees, graphs, dp; difficulty
10 easy / 14 medium / 6 hard; ≥6 test cases with exactly 2 samples each.

### The bug this caught

The bank encodes tree inputs as **level-order arrays**, but tree signatures
promise a **`TreeNode`**. The runner spread `input` straight into the
candidate's function — so every `trees` problem would have handed a raw array
to code expecting nodes, thrown on every case, and reported a **correct
solution as 0/n**. Exactly the failure mode the rest of this file is about.

Fixed: `treeArgPositions()` reads TreeNode positions from the Python
signature (the only one carrying annotations; argument order matches across
languages), and `buildDriver` emits a `TreeNode` class plus a level-order
builder and materialises those positions before calling. The prelude also
supplies the `typing` imports the signatures use — without them the
candidate's own annotation raises `NameError` before their code runs.

Guarded by `src/dsa/driver.integration.test.ts`, which runs a real recursive
solution through **real Python and real Node** against level-order arrays
including `[]`, single-node, and both spines. String-asserting the driver
would not have caught this: the generated Python looked perfectly valid.

### Finding: the free tier cannot run one interview

Validation exhausted the key: `429 ... generate_content_free_tier_requests`.
Not transient — the daily allowance was gone.

This matters commercially. One session makes an assessment call per answer
(20-40), plus a resume parse, plus a report generation. **A BYOK customer on
a free key will stall mid-interview.**

Two changes followed:
- A 429 is now split by meaning. A rate limit backs off and retries; a spent
  quota throws `QuotaExhaustedError` immediately with a plain instruction,
  and does **not** walk the model fallback chain — quota is per key, so
  another model cannot help. Retrying into a wall wastes the user's time and
  hides an error only they can fix.
- [REQUIREMENTS.md](REQUIREMENTS.md) now states billing is required, and
  onboarding must say so before a user starts an interview they can't finish.

## Adversarial code review (28 confirmed findings)

A multi-agent review swept the codebase across seven dimensions (session
loop, promise fidelity, persistence, DSA judging, UX failure modes,
security, test coverage). Each raised finding faced three independent
skeptics with distinct lenses (correctness, already-handled, materiality);
only findings a majority could not refute survived. 36 raised, **28
survived**, deduped to ~20 distinct defects, all fixed. Highlights:

**The packaged app's database was entirely dead.** The Tauri capability
granted only `core`+`opener`; the ACL is deny-by-default, so `Database.load`
and every query were denied in the shipped build. Dev never caught it
because in-browser runs skip the DB path. This is why "validated in Chrome"
is not "validated as shipped" — added `sql:*` permissions.

**Every answer was graded against the *next* question.** Gemini fires
turn-complete when the MODEL stops, so one accumulation window held [answer
to Q1] + [the follow-up Q2]. The engine paired them directly — a technical
answer read as "evasive" for dodging a question never asked, in writing, in
the report. Fixed by carrying the question across the boundary; pinned by
`session.test.ts`.

**The one empathy branch was dead code.** The current assessment was
recorded before the depth controller ran, so its slice(-1) lookback saw the
current answer and `probe-gently` could never fire — a struggling candidate
was dropped instead of given the promised gentle re-ask. Fixed by deciding
before recording.

**A correct-but-chatty solution was reported as an infinite loop.** exec.rs
read stdout only after the child exited, so output over the ~64KB pipe buffer
deadlocked and tripped the timeout. Now drained concurrently.

**A near-correct solution scored 0/N.** The Python driver serialised all
results in one `json.dumps` (allow_nan=True) outside the per-case try; one
`float('inf')` return emitted invalid JSON that voided every passing case.
Now per-case with allow_nan=False.

Also fixed: dropped answers when assessments ran long (now queued, never
dropped); a report fabricated from threads with zero assessments; a coding
round that made the report permanently unreachable; a failed report that
discarded the whole hour with no retry; the transcript never persisted;
thread-id collisions across restarts overwriting a prior interview;
non-fatal assessment errors rendered as fatal; a silent WebSocket drop; a
denied mic leaking a billed session; undetected mic device loss; the
session-duration cap cutting off hour-long interviews; and JD-awareness that
was promised but never implemented.

Test count went 126 → 131, including the first tests over the orchestration
loop (Q/A pairing, gentle re-probe, no-drop queue) and real-interpreter
tests for the inf/NaN driver fix.
