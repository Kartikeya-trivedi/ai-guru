import { useEffect, useState } from "react";
import { deleteKey, getKey, inDesktopApp, setKey, type ProviderId } from "../providers/keys";
import {
  getReasoningProvider,
  setReasoningProvider,
  type ReasoningProviderId,
} from "../providers/reasoning";

/**
 * BYOK settings. Keys go straight to the OS credential store via Rust —
 * they are never written to SQLite, never to a config file, and never held
 * in React state beyond the moment of entry.
 */

const PROVIDERS: {
  id: ProviderId;
  name: string;
  role: string;
  where: string;
  required: boolean;
}[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    role: "Realtime voice interviewer, resume parsing, grading, reports",
    where: "aistudio.google.com → Get API key · enable billing",
    required: true,
  },
  {
    id: "groq",
    name: "Groq",
    role: "Optional alternative for grading, judging and reports. Also acts as a backup voice: if your Gemini quota runs out mid-interview, the interview keeps going on Groq instead of ending — slower, and without video, but you still finish and get your report.",
    where: "console.groq.com → API Keys",
    required: false,
  },
  {
    id: "simli",
    name: "Simli — photoreal interviewer",
    role: "Streams a real video face lip-synced to the interviewer's voice. Without it you get the built-in animated face, which is free and works offline.",
    where: "simli.com · billed per minute · adds some reply latency",
    required: false,
  },
];

function KeyRow({ p }: { p: (typeof PROVIDERS)[number] }) {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getKey(p.id).then((k) => setSaved(Boolean(k)));
  }, [p.id]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setKey(p.id, value.trim());
      setSaved(true);
      // Don't keep the secret in component state a moment longer than needed.
      setValue("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await deleteKey(p.id);
    setSaved(false);
  };

  return (
    <div className="reveal panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {p.name}
            {p.required && <span className="faint mono small"> · required</span>}
          </div>
          <div className="muted small" style={{ marginTop: 3 }}>{p.role}</div>
        </div>
        <span className="eyebrow" style={{ color: saved ? "var(--good)" : "var(--text-faint)" }}>
          {saved ? "stored" : "not set"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          type="password"
          placeholder={saved ? "•••••••••••••••• (replace)" : "Paste API key"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" disabled={!value.trim() || busy} onClick={save}>
          {busy ? <span className="spinner" /> : "Save"}
        </button>
        {saved && (
          <button className="btn btn-ghost" onClick={clear}>Clear</button>
        )}
      </div>
      <div className="faint small mono" style={{ marginTop: 8 }}>{p.where}</div>
      {err && <div className="notice" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

/**
 * Which provider does the thinking. Voice is not offered as a choice here
 * because there isn't one: Gemini Live is the only native speech-to-speech
 * among these, and routing voice through Groq would mean speech-to-text,
 * then text, then text-to-speech — three round trips where Gemini does one.
 * Putting that behind a dropdown would hide a large latency regression from
 * the person least able to diagnose it.
 */
function TextProviderChoice() {
  const [provider, setProvider] = useState<ReasoningProviderId>(getReasoningProvider);
  const [groqKey, setGroqKey] = useState<boolean | null>(null);

  useEffect(() => {
    void getKey("groq").then((k) => setGroqKey(Boolean(k)));
  }, [provider]);

  const choose = (id: ReasoningProviderId) => {
    setReasoningProvider(id);
    setProvider(id);
  };

  return (
    <div className="reveal panel">
      <div style={{ fontSize: 14, fontWeight: 500 }}>Grading, judging &amp; reports</div>
      <div className="muted small" style={{ marginTop: 3 }}>
        The model that scores your answers and writes the report. Separate from the
        interviewer's voice, which is always Gemini.
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {(["gemini", "groq"] as ReasoningProviderId[]).map((id) => (
          <button
            key={id}
            className={provider === id ? "btn" : "btn btn-ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => choose(id)}
          >
            {id === "gemini" ? "Gemini" : "Groq"}
          </button>
        ))}
      </div>

      {provider === "groq" && groqKey === false && (
        <div className="notice" style={{ marginTop: 12 }}>
          Groq is selected but no Groq key is saved below — grading will fail until you add one
          or switch back to Gemini.
        </div>
      )}
    </div>
  );
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="center">
      <div className="stack">
        <div className="reveal">
          <span className="eyebrow">Settings</span>
          <h1 className="serif-title" style={{ marginTop: 8 }}>Your API keys</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            You bring your own keys and pay providers directly — we never see them, never proxy
            your audio, and never meter you. Keys are stored in your operating system's credential
            manager, not in this app's database.
          </p>
        </div>

        {/* Better they learn this here than 20 minutes into an interview. */}
        <div className="notice info reveal">
          <strong>Your Gemini key needs billing enabled.</strong> An interview makes a grading call
          for every answer you give, plus the resume parse and the final report — comfortably past
          the free tier's daily limit. A free key will stop partway through. Usage is typically
          cents per interview.
        </div>

        {!inDesktopApp() && (
          <div className="notice info reveal">
            Running in a browser, so there's no OS keychain here — keys are read from
            <span className="mono"> app/.env</span> for development. Install the desktop app to
            store them securely.
          </div>
        )}

        <TextProviderChoice />

        {PROVIDERS.map((p) => (
          <KeyRow key={p.id} p={p} />
        ))}

        <div style={{ paddingBottom: 40 }}>
          <button className="btn btn-ghost" onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  );
}
