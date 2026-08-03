# Setup

From a fresh machine to a running interview, then to a sellable installer.
Windows is the primary target; notes for macOS/Linux where they differ.

## 1. Install the prerequisites

| Tool | Version | Why | Get it |
|------|---------|-----|--------|
| **Node.js** | 20+ (22 tested) | Front end, build, tests | https://nodejs.org |
| **Rust** | 1.80+ (1.88 tested) | Tauri desktop shell | https://rustup.rs |
| **WebView2** | any | The webview the app renders in | Preinstalled on Win 11; else the "Evergreen Bootstrapper" from Microsoft |
| **Python** | 3.10+ | Runs candidate Python in DSA rounds | https://python.org (tick "Add to PATH"; do NOT rely on the Microsoft Store stub) |
| **Node** (again) | — | Also runs candidate JavaScript | already installed above |

Optional, only if you want C++/Java **execution** in DSA rounds (they are
AI-reviewed without these): a C++ toolchain (`g++` via MSYS2/WinLibs on
Windows) and a JDK 17+ (`javac`).

Windows desktop builds also need the **MSVC C++ build tools** (Rust uses the
MSVC linker) — install "Desktop development with C++" from the Visual Studio
Build Tools if `cargo build` complains about `link.exe`.

Verify:

```bash
node --version && rustc --version && python --version
```

## 2. Get the code

```bash
git clone https://github.com/Kartikeya-trivedi/interview-system.git
cd interview-system/app
npm install
```

`npm install` also compiles nothing Rust-side yet — that happens on first
`tauri` run.

## 3. Add a Gemini API key

Get one at [aistudio.google.com](https://aistudio.google.com) → "Get API
key", and **enable billing on it**. The free tier cannot finish a single
interview — one session makes a grading call per answer plus a resume parse
and a report, well past the free daily limit. The app will detect an
exhausted quota and tell you, but you'll have wasted the interview.

**For browser dev:** copy the example env file and paste your key.

```bash
cp .env.example .env
# edit .env, set GEMINI_API_KEY=...
```

**For the desktop app:** skip the file — you enter the key in the app's
Settings screen, and it's stored in the OS credential manager (Windows
Credential Manager / macOS Keychain), never on disk in the app.

## 4. Run it — two ways

### A. Browser (fastest for iterating on the UI/logic)

```bash
npm run dev
```

Open http://localhost:1420 in **Chrome** (not the app's own preview pane —
that blocks the mic). Use **headphones** — on speakers the interviewer hears
itself and interrupts itself. The key comes from `.env`. Note: the browser
path skips the local SQLite database and code execution (those live in the
Rust shell), so session history and the DSA "Run" button only work in the
desktop app.

### B. Desktop app (the real thing)

```bash
npm run tauri dev
```

First run compiles the Rust shell (a few minutes; subsequent runs are fast).
A native window opens. Add your key in **Settings**, then upload a resume.
This path has the keychain, local database, and code execution.

## 5. Do an interview

1. **Upload a resume** (a text-based PDF — scanned/image PDFs aren't
   supported yet). Wait ~15 s while it's parsed.
2. You'll see **what the interviewer decided to probe** — review it, pick the
   target role + seniority, optionally paste a job description.
3. **Begin interview.** Allow the mic when prompted (**Allow**, not Block —
   Block is annoying to undo). Talk.
4. Reach the technical stage → optionally **Start coding round**.
5. **End & get report** → a structured evaluation you can print to PDF.

## 6. Build the sellable installer

```bash
npm run tauri build
```

Produces, under `app/src-tauri/target/release/bundle/`:

- `msi/app_0.1.0_x64_en-US.msi`
- `nsis/app_0.1.0_x64-setup.exe`

The build runs `check-bundle-secrets.mjs` first and **refuses to package if
any API key leaked into the front-end bundle** — so a developer's `.env` key
can never ship to customers.

Before selling installers you'll also want a **code-signing certificate**
(Windows SmartScreen warns on unsigned installers); that's a purchase, not a
code change, and is out of scope here.

## 7. Verify the setup

```bash
npm test                                  # 131 unit/integration tests
node scripts/validate-gemini-live.mjs     # voice latency vs the real API (needs .env key + quota)
node scripts/validate-assessment.mjs      # grading judgement + latency
```

## Troubleshooting

- **"GEMINI_API_KEY missing"** in the browser → you didn't create `.env` or
  didn't restart `npm run dev` after editing it.
- **Quota / 429 mid-interview** → the key has no billing enabled. This is the
  single most common setup mistake.
- **`link.exe` not found / MSVC error** on `tauri dev`/`build` → install the
  Visual Studio C++ Build Tools (step 1).
- **DSA "Run" says Python isn't installed** but it is → you have only the
  Microsoft Store `python.exe` alias stub. Install real Python from
  python.org and tick "Add to PATH".
- **Mic never prompts in the desktop window** → known Tauri/WebView2 issue on
  some setups; check Windows Settings → Privacy → Microphone → "Let desktop
  apps access your microphone" is on. This is the one path still unverified
  end-to-end (see VALIDATION.md).
- **No audio / it talks over you** → you're on speakers. Use headphones.
