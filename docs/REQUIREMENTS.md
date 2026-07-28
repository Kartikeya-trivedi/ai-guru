# Requirements from the owner (to start building & validating)

## API keys (needed for Phase 1+)

| Key | Where to get it | Needed for | When |
|-----|-----------------|------------|------|
| **Gemini API key — billing enabled** | https://aistudio.google.com → "Get API key", then enable billing | Realtime voice interviewer + reasoning model | **Now** |

> **The free tier is not enough to run one interview.** Measured, not
> assumed: a session makes an assessment call per answer (20-40), plus a
> resume parse, plus a report — and free-tier daily request limits are far
> below that. During Phase 4 validation the key returned
> `429 generate_content_free_tier_requests` and stayed exhausted for the day.
>
> This is a **product** issue, not just a dev inconvenience: customers who
> BYOK with a free key will stall mid-interview. The app now detects a spent
> quota and says so plainly instead of retrying into a wall, but onboarding
> must tell users up front that billing is required. Free tier is fine for
> the voice spike and a couple of parses; it is not fine for real use.
| xAI (Grok) API key | https://console.x.ai | Grok text provider | Phase 6 |
| ElevenLabs API key | https://elevenlabs.io | TTS in the fallback pipeline for text-only providers | Phase 6 (optional) |

Keys are entered in the app's settings and stored in the Windows
Credential Manager — never committed, never in config files. For dev,
a `.env` in `app/` (gitignored) is fine.

## Hardware / environment

- **Microphone + headphones** (headset preferred — avoids echo/feedback in
  voice testing and makes latency perception honest). Needed Phase 1.
- Windows 11 with WebView2 (preinstalled) ✅
- Node 22, Rust 1.88, Python 3.12 ✅ (already on this machine)
- For DSA execution testing (Phase 4): language runtimes for whatever we
  support at launch — Python ✅ and Node ✅ are present; add **GCC/G++
  (via MSYS2 or WinLibs)** and a **JDK** when we get there if C++/Java are
  launch languages.

## Test material (Phase 2–3 validation)

- 2–3 **real resumes** (PDF) — ideally one strong, one average, so we can
  see the interviewer adapt.
- 1–2 **real job descriptions** (paste text) for target roles, e.g. an ML
  Engineer JD.

## Decisions needed from the owner

- **DSA launch languages** (proposal: Python, JavaScript, C++, Java).
- **Launch problem-bank size/topics** (proposal: ~30 originals across
  arrays/strings, hashing, two pointers, trees, graphs, DP).
- Product name (for the installer/branding, whenever ready).

## Later (not blocking)

- Code-signing certificate (Windows) — needed before selling installers,
  not for development.
- Payment/licensing choice (Paddle/LemonSqueezy/Stripe) — V1 validates
  with manual licenses first.
