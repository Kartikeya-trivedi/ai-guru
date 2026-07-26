# PRD & Roadmap

> Process note: per our own operating principles, this PRD comes first;
> execution happens in phases against it, with walkthroughs and automated
> tests before manual testing. Every feature below must pass the founder
> test: **would someone pay for this?**

## Operating principles

1. **Build a business, not a demo.** Every feature must create paid-for
   value. Features that only impress engineers get cut.
2. **CARE.** Care goes into product design, not just code. The AI should
   reflect how a thoughtful human behaves.
3. **Human interviewer first, AI second.** Design the interview before
   writing prompts.
4. **Empathy is a requirement, not a nicety.** The interviewer must respond
   naturally, encourage candidates, and behave professionally — this is an
   explicit part of the interviewer persona prompt, and "does it feel
   robotic?" is a release-blocking question.
5. **Simulate interview pressure.** Voice recreates the anxiety of a real
   interview; that pressure is part of the product's value.
6. **Resume is memory, not an attachment.**
7. **Depth beats breadth.** Follow-ups ("why? how? what if?") until the
   candidate's knowledge limit. Fewer topics, deeper threads.
8. **Evaluate reasoning, not memorization.** Assessment prompts score how
   the candidate thinks, not fact recall.
9. **Job-description aware.** Questions adapt to the target role, not
   generic trivia.
10. **Everything has a rationale.** Design decisions are recorded (see
    Rationale ledger below and ARCHITECTURE.md).
11. **Iterate in versions.** Ship V1 fast; realism, grading depth, video
    etc. come in V2+.
12. **Automated E2E before manual testing.** The agent tests its own work.

## Personas & value proposition

- **Primary buyer (V1): the candidate.** Preparing for tech interviews
  (ML/SWE/DSA). Pays because: realistic voice pressure + resume-specific
  drilling + actionable report = measurably better prep than question banks.
- **Later (V2+): bootcamps/universities** (cohort licenses), **recruiters**
  (screening mode).

## V1 — the sellable core

An hour-long, voice-to-voice, resume-aware, JD-aware mock interview with a
Socratic interviewer and a structured report. Scope:

| # | Feature | Why someone pays |
|---|---------|------------------|
| 1 | Resume upload → parsed memory | Interview is about *them*, not generic |
| 2 | Job-description input (paste text or pick role preset) | Prep targets the actual job |
| 3 | Realtime voice interview (Gemini Live), barge-in, human-feeling latency | The pressure is the product |
| 4 | Staged flow + Socratic depth controller | Feels like a real senior interviewer |
| 5 | Empathetic interviewer persona | Doesn't feel robotic → users come back |
| 6 | Structured report with evidence + actionable improvements | The artifact they keep and act on |
| 7 | BYOK settings (Gemini, Grok, OpenAI-compat), keys in OS keychain | Trust + no metering costs |
| 8 | Session history (past interviews + reports, local) | Progress over time |
| 9 | DSA rounds: LeetCode-style problems with hybrid judging | Coding-interview prep is the highest-demand segment |

### DSA round design (mirrors a real coding interview)

1. **Before coding:** the interviewer presents the problem over voice; the
   candidate discusses approach, complexity, and edge cases *first* — the
   interviewer probes the plan Socratically before any code is written.
2. **While coding:** in-app editor (Monaco, multi-language). The candidate
   can think aloud; the interviewer behaves like a real one — nudges when
   asked, drops hints if truly stuck, never writes the solution.
3. **Judging is hybrid:**
   - **Test cases:** the solution runs locally against the problem's test
     cases (pass/fail ground truth). Results are fed to the judge as ground
     truth it may not contradict — a model talking itself into "looks right"
     over a failing suite is the exact failure hybrid judging prevents.
   - **AI judge:** the reasoning model evaluates approach quality, edge-case
     *anticipation*, complexity, and code clarity — what tests can't see.
4. Problem bank: **LeetCode-style original problems** bundled per topic
   (arrays, graphs, DP, ...) with test cases. We author originals in the
   style of well-known problems — actual LeetCode content is copyrighted
   and can't be shipped in a sold product.

**Execution scope in V1 — Python and JavaScript only.** Both marshal test
data as JSON in a few lines of stdlib. C++ and Java have no cheap stdlib
JSON, so a correct harness needs per-signature marshalling; a half-built one
would report a *correct* solution as failing, and failing a candidate
unfairly is the worst bug this product can ship. C++/Java are therefore
write-and-AI-judge in V1, and the UI says so plainly instead of pretending.
V1.x: generate marshalling from each problem's typed signature.

**Code-execution threat model.** The candidate runs their own code on their
own machine — the same trust boundary as opening a terminal themselves. So
execution is not sandboxed against the user; it is bounded to protect the
*interview*: hard wall-clock kill (runaway loops), capped output, and
crashes surfaced as test failures. If this ever runs code the user did not
write (shared solutions, hosted mode), that model breaks and real isolation
becomes mandatory.

Explicitly **out of V1**: video, screen presence analysis,
cohort/recruiter features, payments/licensing (V1 validates with direct
sales/manual licenses).

## V1 execution phases

- **Phase 0 — scaffold** ✅ (repo, docs, Tauri app, typed domain core)
- **Phase 1 — voice spike (de-risk first)** ✅ **PASSED** — Gemini Live
  channel end-to-end with barge-in; **544 ms** time-to-first-audio on
  `gemini-3.1-flash-live-preview` vs. the 800 ms budget. Evidence and the
  rejected-model comparison: [VALIDATION.md](VALIDATION.md). Human
  feel-test still outstanding (needs a headset).
- **Phase 2 — resume & JD pipeline:** upload PDF/DOCX → parse → structured
  sections in SQLite; JD paste → extracted role requirements.
- **Phase 3 — interview engine:** stage machine + depth controller +
  candidate model wired to the voice channel; interviewer persona prompt
  (empathy, professionalism, encouragement).
- **Phase 4 — DSA rounds** ✅ built — problem bank (originals + test cases),
  Monaco editor, pre-coding discussion gate, local execution (Rust), hybrid
  AI + test-case judging. Python/JS execute; C++/Java AI-judged (above).
- **Phase 5 — report** ✅ built — thread/assessment aggregation → structured
  report grounded in depth-per-thread, in-app view + print-to-PDF.
- **Phase 6 — settings & providers** ✅ BYOK UI + OS keychain via Rust.
  Grok pipeline fallback and OpenAI-compat adapter still to do.
- **Phase 7 — hardening:** E2E test suite, walkthroughs, installer builds
  (Windows first), latency/robustness passes. **Blocking item: Tauri/
  WebView2 microphone access** — see VALIDATION.md; foundational, not polish.

Each phase ends with: automated tests green → agent walkthrough → manual
test.

## V2+ candidates (re-rank by user feedback)

- Better grading calibration (rubrics per role/seniority)
- Video presence, filler-word/communication analytics
- Question-bank packs per company/role
- Licensing/activation + auto-update + payments
- Cohort dashboards (B2B)

## Testing strategy

- **Unit:** engine logic (stage transitions, depth decisions, thread
  bookkeeping) with mocked providers — Vitest.
- **E2E:** UI flows driven automatically before any manual testing.
  Note: Playwright can't drive a Tauri WebView2 window directly, so E2E
  runs in two layers: (a) Playwright against the Vite dev build in a
  browser with a **mock provider** (deterministic interviewer), covering
  upload → interview → report; (b) `tauri-driver` (WebDriver) smoke tests
  for the packaged app. The agent inspects failures and fixes before
  handing over.
- **Voice quality:** scripted latency measurements (p50/p95 first-audio)
  logged per session in dev builds.

## Rationale ledger

| Decision | Rationale |
|----------|-----------|
| Tauri over Electron | Smaller installer for a *sold, downloaded* product; Rust shell gives keychain + future sandbox; web audio fully available in WebView2 |
| BYOK, no relay server | Zero infra cost, better latency (device→provider direct), privacy story sells |
| SQLite over Supabase | Desktop local-first; resume "memory" needs no cloud; offline works |
| Gemini Live first | Only launch-ready native speech-to-speech among target providers; p95 human-feel is the product |
| `gemini-3.1-flash-live-preview` as the launch model | Measured 544 ms to first audio vs. 1813 ms for `gemini-2.5-flash-native-audio` — 3.3× faster on the metric that decides whether the product feels human ([VALIDATION.md](VALIDATION.md)) |
| Two model roles (conversation + reasoning) | Realtime model does the talking; cheap text model does assessment/report — cost + quality both improve |
| Hybrid DSA judging (test cases + AI judge) in V1 | Test cases give ground truth; the AI judge evaluates reasoning, edge-case thinking, and clarity — together they mirror how a human interviewer actually scores a coding round |
| Original LeetCode-style problems, not LeetCode content | Actual problems are copyrighted; can't ship them in a sold product |
| Execution limited to Python/JS in V1 | A harness that fails correct C++/Java solutions is worse than no harness; honest gating beats a broken feature |
| Code execution not sandboxed against the user | The candidate runs their own code on their own machine — same trust boundary as their own terminal. Bounds exist to protect the interview (timeouts, output caps), not to defend the machine from its owner |
| `dompurify` pinned via npm overrides | Monaco ships a version with known XSS advisories; we sell this app, so we don't inherit CVEs |
| Fonts bundled via @fontsource | Offline-first desktop product — a UI that needs a CDN to render its own type isn't offline |
| Depth controller as code, not prompt | "Drill deeper" as an explicit state machine is testable, tunable, and can't be prompt-drifted away |
