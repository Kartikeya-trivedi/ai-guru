import { useState } from "react";
import { inDesktopApp, setKey } from "../providers/keys";

/**
 * First-run key gate.
 *
 * BYOK means the app is inert until it has a key, so rather than bury key
 * entry behind Settings and greet a new user with an error the moment they
 * upload, we ask for it up front — this is the first thing the app shows when
 * no Gemini key is stored.
 *
 * Desktop: the key is written straight to the OS credential store via Rust.
 * Browser dev has no keychain, so there is nothing to type — the key comes
 * from app/.env, and this screen only tells the developer that.
 */
export function KeyOnboarding({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const desktop = inDesktopApp();

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setKey("gemini", value.trim());
      setValue(""); // don't hold the secret in state longer than needed
      onReady();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="stack">
        <div className="reveal">
          <span className="eyebrow">Welcome</span>
          <h1 className="serif-title" style={{ marginTop: 8 }}>
            Bring your own key.
          </h1>
          <p className="muted" style={{ marginTop: 10 }}>
            This interviewer runs on your own Gemini key and talks to Google directly — we never see
            it, never proxy your audio, and never meter you.
            {desktop && " Your key is stored in your operating system's credential manager, not in this app."}
          </p>
        </div>

        {/* Better they learn this now than 20 minutes into an interview. */}
        <div className="notice info reveal">
          <strong>Enable billing on the key.</strong> An interview makes a grading call for every
          answer, plus the resume parse and the final report — past the free tier's daily limit, so a
          free key stops partway through. It's typically cents per interview.
        </div>

        {desktop ? (
          <div className="reveal panel">
            <span className="eyebrow">Gemini API key</span>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                type="password"
                placeholder="Paste your key"
                value={value}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim() && !busy) void save();
                }}
              />
              <button className="btn btn-live" style={{ width: "auto" }} disabled={!value.trim() || busy} onClick={save}>
                {busy ? <span className="spinner" /> : "Save & continue"}
              </button>
            </div>
            <a
              className="faint small mono"
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-block", marginTop: 10, color: "var(--data)" }}
            >
              Get a key at aistudio.google.com →
            </a>
            {err && <div className="notice" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        ) : (
          <div className="notice info reveal">
            You're running in a browser, where there's no keychain to store a key. Set
            <span className="mono"> GEMINI_API_KEY</span> in <span className="mono">app/.env</span> and
            restart the dev server. (The packaged desktop app lets you enter it here instead.)
          </div>
        )}
      </div>
    </div>
  );
}
