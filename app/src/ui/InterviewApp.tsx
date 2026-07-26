import { useCallback, useEffect, useRef, useState } from "react";
import { extractPdfText } from "../resume/extract";
import { parseResume } from "../resume/parse";
import { InterviewSession } from "../engine/session";
import { generateReport } from "../report/generate";
import { DEFAULT_STAGES } from "../engine/stages";
import { getKey, inDesktopApp } from "../providers/keys";
import * as db from "../db";
import { ReportView } from "./ReportView";
import { SettingsPanel } from "./SettingsPanel";
import { CodingRound } from "./CodingRound";
import { pickProblem } from "../dsa/select";
import { judgeSolution, type CodeVerdict } from "../dsa/judge";
import type { Problem } from "../dsa/problems";
import type { Language, RunOutcome } from "../dsa/harness";
import type { ParsedResume } from "../resume/types";
import type { JobTarget, StageDefinition, Thread } from "../engine/types";
import type { InterviewReport } from "../report/types";
import "./theme.css";

type View = "upload" | "parsing" | "brief" | "live" | "coding" | "generating" | "report" | "settings";

const ROLES = ["AI Engineer", "Infra Engineer", "Cloud Engineer", "DevOps Engineer"];
const SENIORITIES: JobTarget["seniority"][] = ["intern", "junior", "mid", "senior", "staff"];

export function InterviewApp() {
  const [view, setView] = useState<View>("upload");
  const [error, setError] = useState<string | null>(null);

  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [role, setRole] = useState(ROLES[0]);
  const [seniority, setSeniority] = useState<JobTarget["seniority"]>("mid");
  const [jd, setJd] = useState("");

  const [status, setStatus] = useState("idle");
  const [stage, setStage] = useState<StageDefinition | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [transcript, setTranscript] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [p95, setP95] = useState<number | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [dragging, setDragging] = useState(false);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [codePhase, setCodePhase] = useState<"discuss" | "code">("discuss");
  const [verdict, setVerdict] = useState<CodeVerdict | null>(null);
  const [judging, setJudging] = useState(false);

  const sessionRef = useRef<InterviewSession | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const persistedDb = inDesktopApp();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    const apiKey = await getKey("gemini");
    if (!apiKey) {
      setError("No Gemini key yet — add one in Settings.");
      return;
    }
    setView("parsing");
    try {
      const text = await extractPdfText(await file.arrayBuffer());
      if (text.trim().length < 200) {
        throw new Error(
          "Couldn't read text from that PDF. Scanned or image-based resumes aren't supported yet — export a text PDF and try again.",
        );
      }
      const parsed = await parseResume(text, { apiKey });
      setResume(parsed);
      if (persistedDb) {
        const row = await db.saveResume(text, parsed);
        setResumeId(row.id);
      }
      setView("brief");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView("upload");
    }
  }, [persistedDb]);

  const start = useCallback(async () => {
    if (!resume) return;
    const apiKey = await getKey("gemini");
    if (!apiKey) return setError("No Gemini key yet — add one in Settings.");

    const jobTarget: JobTarget = { role, seniority, jobDescription: jd || undefined };
    setTranscript([]);
    setThreads([]);
    setReport(null);
    setError(null);
    setView("live");

    let sid: string | null = null;
    if (persistedDb && resumeId) {
      sid = await db.createSession(resumeId, jobTarget);
      setSessionId(sid);
    }

    const session = new InterviewSession(
      { apiKey, resume, jobTarget },
      {
        onStatus: setStatus,
        onStageChange: setStage,
        onThreadUpdate: (t) => {
          setThreads(t);
          if (sid) void db.saveThreads(sid, t).catch(() => {});
        },
        onLatency: (s) => setP95(s.p95),
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
      setView("brief");
    }
  }, [resume, resumeId, role, seniority, jd, persistedDb]);

  const finish = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !resume) return;

    const finalThreads = session.getThreads();
    const candidateModel = session.getCandidateModel();
    session.stop();
    sessionRef.current = null;

    if (finalThreads.length === 0) {
      // Nothing was assessed — a report here would be invented, not earned.
      setError("Interview ended before any answers were assessed, so there's nothing to report on yet.");
      setView("brief");
      return;
    }

    setView("generating");
    try {
      const apiKey = (await getKey("gemini"))!;
      const generated = await generateReport(
        {
          sessionId: sessionId ?? "local",
          candidateName: resume.name,
          jobTarget: { role, seniority, jobDescription: jd || undefined },
          threads: finalThreads,
          candidateModel,
          transcript,
        },
        { apiKey },
      );
      setReport(generated);
      if (sessionId) {
        await db.saveReport(generated);
        await db.endSession(sessionId);
      }
      setView("report");
    } catch (e) {
      setError(`Report generation failed: ${e instanceof Error ? e.message : String(e)}`);
      setView("brief");
    }
  }, [resume, sessionId, role, seniority, jd, transcript]);

  const startCodingRound = useCallback(() => {
    const jobTarget: JobTarget = { role, seniority, jobDescription: jd || undefined };
    const picked = pickProblem(jobTarget);
    if (!picked) return setError("No problem available for this level.");
    setProblem(picked);
    setCodePhase("discuss");
    setVerdict(null);
    sessionRef.current?.presentProblem(picked);
    setView("coding");
  }, [role, seniority, jd]);

  const readyToCode = useCallback(() => {
    setCodePhase("code");
    sessionRef.current?.enterCodingPhase();
  }, []);

  const submitCode = useCallback(
    async (language: Language, source: string, outcome?: RunOutcome) => {
      if (!problem) return;
      sessionRef.current?.reportSolution({
        passed: outcome?.passed ?? 0,
        total: outcome?.total ?? problem.testCases.length,
        executed: Boolean(outcome),
      });
      setJudging(true);
      try {
        const apiKey = (await getKey("gemini"))!;
        // The discussion before coding is where edge-case anticipation shows
        // up, so the judge needs it — not just the final source.
        const discussion = transcript.map((t) => `${t.role}: ${t.text}`).join("\n");
        setVerdict(
          await judgeSolution(
            { problem, language, source, outcome, discussionTranscript: discussion },
            { apiKey },
          ),
        );
      } catch (e) {
        setError(`Judging failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setJudging(false);
      }
    },
    [problem, transcript],
  );

  const stageIndex = stage ? DEFAULT_STAGES.findIndex((s) => s.id === stage.id) : -1;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Interview<em>.</em></span>

        {view === "live" && (
          <>
            <div className="rail">
              {DEFAULT_STAGES.map((s, i) => (
                <span key={s.id} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span className="rail-sep" />}
                  <span className={`rail-step ${i === stageIndex ? "active" : i < stageIndex ? "done" : ""}`}>
                    {s.id}
                  </span>
                </span>
              ))}
            </div>
            <div className="spacer" />
            <div className="readout">
              {p95 != null && (
                <span className="metric">
                  P95 <b className={p95 > 800 ? "hot" : ""}>{p95}</b> MS
                </span>
              )}
            </div>
            <span className={`tally ${status === "live" ? "on" : ""}`}>
              <span className="bulb" />
              {status === "live" ? "ON AIR" : status.toUpperCase()}
            </span>
          </>
        )}

        {view !== "live" && (
          <>
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={() => setView(view === "settings" ? "upload" : "settings")}>
              {view === "settings" ? "Close" : "Settings"}
            </button>
          </>
        )}
      </header>

      <main className="main">
        {view === "settings" && <SettingsPanel onBack={() => setView(resume ? "brief" : "upload")} />}

        {view === "upload" && (
          <div className="center">
            <div className="stack">
              <div className="reveal">
                <span className="eyebrow">Step one</span>
                <h1 className="serif-title" style={{ marginTop: 8 }}>
                  Hand over your resume.
                </h1>
                <p className="muted" style={{ marginTop: 10 }}>
                  Your interviewer reads it before you speak — the same way a real one does. Questions come
                  from your actual projects, not a question bank. It never leaves this machine.
                </p>
              </div>

              {error && <div className="notice reveal">{error}</div>}

              <label
                className={`dropzone reveal ${dragging ? "over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void onFile(f);
                }}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <div className="serif-title" style={{ fontSize: 22 }}>Drop a PDF here</div>
                <div className="faint small mono" style={{ marginTop: 8 }}>or click to browse</div>
              </label>
            </div>
          </div>
        )}

        {view === "parsing" && (
          <div className="center">
            <div className="stack" style={{ marginTop: 60 }}>
              <span className="eyebrow">Reading</span>
              <h1 className="serif-title">Working out what to ask you.</h1>
              <p className="muted">
                <span className="spinner" /> Finding the claims worth pulling on. About fifteen seconds.
              </p>
            </div>
          </div>
        )}

        {view === "generating" && (
          <div className="center">
            <div className="stack" style={{ marginTop: 60 }}>
              <span className="eyebrow">Writing up</span>
              <h1 className="serif-title">Your interviewer is writing their evaluation.</h1>
              <p className="muted">
                <span className="spinner" /> Weighing what you said against how deep it held.
              </p>
            </div>
          </div>
        )}

        {view === "report" && report && resume && (
          <ReportView report={report} candidateName={resume.name} onBack={() => setView("brief")} />
        )}

        {view === "brief" && resume && (
          <div className="center">
            <div className="stack">
              <div className="reveal">
                <span className="eyebrow">Ready · {resume.name}</span>
                <h1 className="serif-title" style={{ marginTop: 8 }}>Here's what caught my eye.</h1>
                <p className="muted small" style={{ marginTop: 8 }}>
                  {resume.projects.length} projects · {resume.experience.length} roles · {resume.skills.length} skills
                </p>
              </div>

              {error && <div className="notice reveal">{error}</div>}

              <div className="reveal panel">
                {resume.projects.map((p) => (
                  <div key={p.name} className="trace">
                    <div className="trace-topic">{p.name}</div>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 16 }}>
                      {(p.probeAngles ?? []).map((a, i) => (
                        <li key={i} className="muted small" style={{ margin: "5px 0" }}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="reveal panel">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="eyebrow">Target role</span>
                    <select value={role} onChange={(e) => setRole(e.target.value)}>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="eyebrow">Seniority</span>
                    <select value={seniority} onChange={(e) => setSeniority(e.target.value as JobTarget["seniority"])}>
                      {SENIORITIES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="eyebrow">Job description — optional</span>
                  <textarea
                    rows={4}
                    value={jd}
                    placeholder="Paste it and the technical round targets this job specifically."
                    onChange={(e) => setJd(e.target.value)}
                  />
                </label>
              </div>

              <div className="reveal">
                <button className="btn btn-live" onClick={start}>Begin interview</button>
                <p className="faint small mono" style={{ marginTop: 10, textAlign: "center" }}>
                  Wear headphones · it hears itself on speakers
                </p>
              </div>

              <div style={{ height: 40 }} />
            </div>
          </div>
        )}

        {view === "live" && resume && (
          <div className="split">
            <aside>
              <span className="eyebrow">Threads</span>
              {threads.length === 0 && (
                <p className="faint small" style={{ marginTop: 10 }}>
                  Every line of questioning shows up here as it goes deeper.
                </p>
              )}
              {threads.map((t) => (
                <div key={t.id} className="trace">
                  <div className="trace-topic">{t.topic}</div>
                  <div className="trace-meta">
                    DEPTH {t.depth}{t.exhausted && " · LIMIT REACHED"}
                  </div>
                  <div className="trace-dots">
                    {t.assessments.map((a, i) => (
                      <span key={i} className={`dot ${a.quality}`} title={`${a.quality} — ${a.note}`} />
                    ))}
                  </div>
                </div>
              ))}

              {stage && (
                <>
                  <span className="eyebrow" style={{ display: "block", marginTop: 24 }}>Now probing</span>
                  <p className="muted small" style={{ marginTop: 6 }}>{stage.objective}</p>
                </>
              )}

              {stage?.id === "technical" && !problem && (
                <button className="btn" style={{ marginTop: 16, width: "100%" }} onClick={startCodingRound}>
                  Start coding round
                </button>
              )}

              <button className="btn btn-ghost" style={{ marginTop: 10, width: "100%" }} onClick={finish}>
                End &amp; get report
              </button>
              {error && <div className="notice" style={{ marginTop: 12 }}>{error}</div>}
            </aside>

            <section>
              {transcript.length === 0 && (
                <p className="muted">Say hello when you're ready.</p>
              )}
              {transcript.map((line, i) => (
                <div key={i} className={`turn ${line.role}`}>
                  <div className="turn-who">{line.role === "user" ? "You" : "Interviewer"}</div>
                  <div className="turn-text">{line.text}</div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </section>
          </div>
        )}

        {view === "coding" && problem && (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
            <CodingRound
              problem={problem}
              phase={codePhase}
              onReadyToCode={readyToCode}
              onSubmit={submitCode}
            />
            {(judging || verdict) && (
              <div style={{ borderTop: "1px solid var(--line)", padding: "14px 28px", background: "var(--bg-raised)" }}>
                {judging && <span className="muted small"><span className="spinner" /> Your interviewer is reading it…</span>}
                {verdict && (
                  <>
                    <span className="eyebrow">
                      {verdict.complexityReached} · {verdict.complexityOptimal ? "optimal" : "not optimal"}
                    </span>
                    <p style={{ marginTop: 6, fontSize: 13 }}>{verdict.summary}</p>
                    {verdict.edgeCasesMissed.length > 0 && (
                      <div className="tags" style={{ marginTop: 8 }}>
                        {verdict.edgeCasesMissed.map((e, i) => (
                          <span key={i} className="tag bad">missed: {e}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
