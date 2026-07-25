import { useCallback, useRef, useState } from "react";
import { extractPdfText } from "../resume/extract";
import { parseResume } from "../resume/parse";
import { InterviewSession } from "../engine/session";
import type { ParsedResume } from "../resume/types";
import type { JobTarget, StageDefinition, Thread } from "../engine/types";
import { DEFAULT_STAGES } from "../engine/stages";
import "./interview.css";

type Step = "setup" | "parsing" | "ready" | "interview";

const ROLES = ["AI Engineer", "Infra Engineer", "Cloud Engineer", "DevOps Engineer"] as const;
const SENIORITIES = ["intern", "junior", "mid", "senior", "staff"] as const;

export function InterviewApp() {
  const [step, setStep] = useState<Step>("setup");
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [role, setRole] = useState<string>(ROLES[0]);
  const [seniority, setSeniority] = useState<JobTarget["seniority"]>("mid");
  const [jobDescription, setJobDescription] = useState("");

  const [status, setStatus] = useState("idle");
  const [stage, setStage] = useState<StageDefinition | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [transcript, setTranscript] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [latency, setLatency] = useState<{ p50: number | null; p95: number | null }>({ p50: null, p95: null });

  const sessionRef = useRef<InterviewSession | null>(null);
  const apiKey = import.meta.env.GEMINI_API_KEY as string | undefined;

  const onFile = useCallback(
    async (file: File) => {
      if (!apiKey) return setError("GEMINI_API_KEY missing from app/.env");
      setStep("parsing");
      setError(null);
      try {
        const text = await extractPdfText(await file.arrayBuffer());
        if (text.trim().length < 200) {
          throw new Error("Couldn't read text from that PDF — is it a scan? Text-based PDFs only for now.");
        }
        setResume(await parseResume(text, { apiKey }));
        setStep("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStep("setup");
      }
    },
    [apiKey],
  );

  const startInterview = useCallback(async () => {
    if (!apiKey || !resume) return;
    setTranscript([]);
    setThreads([]);
    setError(null);
    setStep("interview");

    const session = new InterviewSession(
      {
        apiKey,
        resume,
        jobTarget: { role, seniority, jobDescription: jobDescription || undefined },
      },
      {
        onStatus: setStatus,
        onStageChange: setStage,
        onThreadUpdate: setThreads,
        onLatency: (s) => setLatency({ p50: s.p50, p95: s.p95 }),
        onError: setError,
        onTranscript: (r, text) =>
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === r) return [...prev.slice(0, -1), { role: r, text: last.text + text }];
            return [...prev, { role: r, text }];
          }),
      },
    );
    sessionRef.current = session;
    try {
      await session.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("ready");
    }
  }, [apiKey, resume, role, seniority, jobDescription]);

  const endInterview = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStep("ready");
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Interview System</h1>
        {step === "interview" && stage && (
          <div className="stages">
            {DEFAULT_STAGES.map((s) => (
              <span key={s.id} className={`chip ${s.id === stage.id ? "active" : ""}`}>
                {s.id}
              </span>
            ))}
          </div>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      {step === "setup" && (
        <section className="card">
          <h2>Upload your resume</h2>
          <p className="muted">
            The interviewer reads it first — questions come from your actual projects, not a question bank.
            It stays on this machine.
          </p>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </section>
      )}

      {step === "parsing" && (
        <section className="card">
          <h2>Reading your resume…</h2>
          <p className="muted">Working out what's worth asking you about. Takes ~15 seconds.</p>
        </section>
      )}

      {(step === "ready" || step === "interview") && resume && (
        <div className="columns">
          <section className="card">
            <h2>{resume.name}</h2>
            <p className="muted">
              {resume.projects.length} projects · {resume.experience.length} roles · {resume.skills.length} skills
            </p>

            {step === "ready" && (
              <>
                <label>
                  Target role
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Seniority
                  <select
                    value={seniority}
                    onChange={(e) => setSeniority(e.target.value as JobTarget["seniority"])}
                  >
                    {SENIORITIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Job description (optional — makes questions role-specific)
                  <textarea
                    rows={4}
                    value={jobDescription}
                    placeholder="Paste the JD here…"
                    onChange={(e) => setJobDescription(e.target.value)}
                  />
                </label>
                <button className="primary" onClick={startInterview}>
                  Start interview
                </button>
                <p className="muted small">Use headphones — otherwise the interviewer hears itself.</p>
              </>
            )}

            {step === "interview" && (
              <>
                <p>
                  Status: <strong>{status}</strong>
                  {latency.p95 != null && (
                    <span className={`lat ${latency.p95 > 800 ? "bad" : "good"}`}>
                      {" "}p95 {latency.p95}ms
                    </span>
                  )}
                </p>
                {stage && (
                  <p className="muted small">
                    <strong>{stage.id}</strong> — {stage.objective.split(".")[0]}.
                  </p>
                )}
                <h3>Threads</h3>
                {threads.length === 0 && <p className="muted small">Drill-downs will appear here.</p>}
                {threads.map((t) => (
                  <div key={t.id} className="thread">
                    <div className="topic">{t.topic}</div>
                    <div className="depth">
                      depth {t.depth}
                      {t.exhausted && " · limit reached"}
                    </div>
                    <div className="dots">
                      {t.assessments.map((a, i) => (
                        <span key={i} className={`dot ${a.quality}`} title={a.note} />
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={endInterview}>End interview</button>
              </>
            )}
          </section>

          <section className="card transcript">
            <h2>{step === "interview" ? "Conversation" : "What the interviewer noticed"}</h2>
            {step === "ready" &&
              resume.projects.map((p) => (
                <div key={p.name} className="thread">
                  <div className="topic">{p.name}</div>
                  <ul>
                    {(p.probeAngles ?? []).map((a, i) => (
                      <li key={i} className="muted small">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {step === "interview" && transcript.length === 0 && (
              <p className="muted">Say hello when you're ready…</p>
            )}
            {step === "interview" &&
              transcript.map((line, i) => (
                <p key={i} className={line.role}>
                  <strong>{line.role === "user" ? "You" : "Interviewer"}:</strong> {line.text}
                </p>
              ))}
          </section>
        </div>
      )}
    </div>
  );
}
