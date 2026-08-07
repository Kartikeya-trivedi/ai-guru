import { useCallback, useEffect, useRef, useState } from "react";
import { extractPdfText } from "../resume/extract";
import { parseResume } from "../resume/parse";
import { InterviewSession } from "../engine/session";
import { generateReport } from "../report/generate";
import { DEFAULT_STAGES } from "../engine/stages";
import { getKey, hasKey, inDesktopApp } from "../providers/keys";
import * as db from "../db";
import { ReportView } from "./ReportView";
import { SettingsPanel } from "./SettingsPanel";
import { KeyOnboarding } from "./KeyOnboarding";
import { CodingRound } from "./CodingRound";
import { VideoStage } from "./VideoStage";
import { screenCaptureSupported } from "../video/capture";
import { describeIntegrity } from "../engine/proctor";
import { extractRequirements } from "../engine/jd";
import { pickProblem } from "../dsa/select";
import { judgeSolution, type CodeVerdict } from "../dsa/judge";
import type { Problem } from "../dsa/problems";
import type { Language, RunOutcome } from "../dsa/harness";
import type { ParsedResume } from "../resume/types";
import type { CandidateModel, JobTarget, StageDefinition, Thread } from "../engine/types";
import type { InterviewReport } from "../report/types";
import "./theme.css";

type View =
  | "booting"
  | "onboard"
  | "upload"
  | "parsing"
  | "brief"
  | "live"
  | "coding"
  | "generating"
  | "report"
  | "report-failed"
  | "settings";

const ROLES = ["AI Engineer", "Infra Engineer", "Cloud Engineer", "DevOps Engineer"];
const SENIORITIES: JobTarget["seniority"][] = ["intern", "junior", "mid", "senior", "staff"];

export function InterviewApp() {
  // Start on a neutral boot state, then resolve to onboarding or upload once
  // we know whether a key exists — avoids flashing the upload screen at a
  // first-run user who has no key yet.
  const [view, setView] = useState<View>("booting");
  const [error, setError] = useState<string | null>(null);
  /** Non-fatal, transient status (e.g. an assessment degraded). Not red. */
  const [notice, setNotice] = useState<string | null>(null);

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

  /** Opt-in before the interview starts; the toggle during it lives on the stage. */
  const [useCamera, setUseCamera] = useState(true);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  /** Drives the interviewer presence animation — true while audio is arriving. */
  const [speaking, setSpeaking] = useState(false);
  const speakingTimer = useRef<number | null>(null);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [codePhase, setCodePhase] = useState<"discuss" | "code">("discuss");
  const [verdict, setVerdict] = useState<CodeVerdict | null>(null);
  const [judging, setJudging] = useState(false);

  /**
   * The report's inputs, retained the moment the interview ends. Report
   * generation is the largest, most failure-prone call in the app and comes
   * after an hour of work — so its inputs must survive a failed attempt to
   * make a retry possible. Without this, one network blip discards the hour.
   */
  const pendingReportRef = useRef<{
    threads: Thread[];
    candidateModel: CandidateModel;
    integrityNotes: string[] | null;
  } | null>(null);

  const sessionRef = useRef<InterviewSession | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const persistedDb = inDesktopApp();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // First-run gate: the app is inert without a key, so put key entry in front
  // rather than greeting a new user with an error on their first upload.
  useEffect(() => {
    let cancelled = false;
    void hasKey("gemini").then((present) => {
      if (!cancelled) setView(present ? "upload" : "onboard");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    const apiKey = await getKey("gemini");
    if (!apiKey) {
      setError("Add your Gemini key to begin.");
      setView("onboard");
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
    if (!apiKey) {
      setError("Add your Gemini key to begin.");
      setView("onboard");
      return;
    }

    const jobTarget: JobTarget = { role, seniority, jobDescription: jd || undefined };
    setTranscript([]);
    setThreads([]);
    setReport(null);
    setError(null);
    setNotice(null);
    pendingReportRef.current = null;
    setView("live");

    // Turn the pasted JD into concrete areas to probe so the technical round
    // actually targets this job. One pre-interview call, off the voice path;
    // a failure here just means generic (skills-based) technical questions.
    if (jd.trim()) {
      try {
        jobTarget.extractedRequirements = await extractRequirements(jd, { apiKey });
      } catch {
        /* non-fatal — fall back to resume skills */
      }
    }

    let sid: string | null = null;
    if (persistedDb && resumeId) {
      sid = await db.createSession(resumeId, jobTarget);
      setSessionId(sid);
    }

    const session = new InterviewSession(
      { apiKey, resume, jobTarget, camera: useCamera },
      {
        onStatus: setStatus,
        onVideoChange: (source, stream) => {
          if (source === "camera") setCameraStream(stream);
          else setScreenStream(stream);
        },
        onStageChange: setStage,
        onThreadUpdate: (t) => {
          setThreads(t);
          if (sid) void db.saveThreads(sid, t).catch(() => {});
        },
        onLatency: (s) => setP95(s.p95),
        onError: setError,
        // Non-fatal: shown calmly, and an empty string clears it on recovery.
        onNotice: (m) => setNotice(m || null),
        onTranscript: (r, text) => {
          // Assistant transcript chunks are the only "is it talking right now"
          // signal we get; a short idle timer turns the presence back off so it
          // doesn't stay lit through the candidate's whole answer.
          if (r === "assistant") {
            setSpeaking(true);
            if (speakingTimer.current) window.clearTimeout(speakingTimer.current);
            speakingTimer.current = window.setTimeout(() => setSpeaking(false), 900);
          }
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === r) return [...prev.slice(0, -1), { role: r, text: last.text + text }];
            return [...prev, { role: r, text }];
          });
        },
        // Persist the transcript at turn boundaries so it survives teardown.
        onTurnComplete: (r, text, stage) => {
          if (sid) void db.saveTurn(sid, r, text, stage).catch(() => {});
        },
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

  /**
   * Generate the report from retained inputs. Separated from finish() so a
   * failed attempt can be retried without a live session — the inputs are
   * already captured; only the network call failed.
   */
  const produceReport = useCallback(async () => {
    if (!resume) return;
    const pending = pendingReportRef.current;
    if (!pending) return;

    setView("generating");
    setError(null);
    try {
      const apiKey = (await getKey("gemini"))!;
      const generated = await generateReport(
        {
          sessionId: sessionId ?? "local",
          candidateName: resume.name,
          jobTarget: { role, seniority, jobDescription: jd || undefined },
          threads: pending.threads,
          candidateModel: pending.candidateModel,
          integrityNotes: pending.integrityNotes,
          transcript,
        },
        { apiKey },
      );
      setReport(generated);
      if (sessionId) {
        await db.saveReport(generated).catch(() => {});
        await db.endSession(sessionId).catch(() => {});
      }
      pendingReportRef.current = null;
      setView("report");
    } catch (e) {
      // The interview is NOT lost — inputs are retained for retry.
      setError(`Report generation failed: ${e instanceof Error ? e.message : String(e)}. Your interview is saved — retry below.`);
      setView("report-failed");
    }
  }, [resume, sessionId, role, seniority, jd, transcript]);

  const finish = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !resume) return;

    const finalThreads = session.getThreads();
    const candidateModel = session.getCandidateModel();
    // Captured before stop(), which tears the monitor down.
    const integrityNotes = describeIntegrity(session.getIntegrityEvents());
    session.stop();
    sessionRef.current = null;
    if (sessionId) void db.endSession(sessionId).catch(() => {});

    // Gate on ASSESSMENTS, not thread count. A thread is created before its
    // assessment call, so a session where every assessment failed still has
    // threads — reporting on it would fabricate scores from no evidence.
    const assessedThreads = finalThreads.filter((t) => t.assessments.length > 0);
    if (assessedThreads.length === 0) {
      setError("The interview ended before any answer could be assessed, so there's nothing to base a report on. This usually means the AI provider was unreachable — check your key and quota.");
      setView("brief");
      return;
    }

    pendingReportRef.current = { threads: assessedThreads, candidateModel, integrityNotes };
    await produceReport();
  }, [resume, sessionId, produceReport]);

  const toggleCamera = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      if (cameraStream) session.disableCamera();
      else await session.enableCamera();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, [cameraStream]);

  const toggleScreen = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      if (screenStream) session.stopScreenShare();
      else await session.startScreenShare();
    } catch (e) {
      // Cancelling the OS picker throws — that's a choice, not a failure, so
      // it lands as a calm notice rather than a red error.
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, [screenStream]);

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

        {(view === "live" || view === "coding") && (
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

        {/* No Settings affordance before onboarding — the key screen IS the
            settings surface at that point, and there's nowhere to go back to. */}
        {view !== "live" && view !== "coding" && view !== "booting" && view !== "onboard" && (
          <>
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={() => setView(view === "settings" ? "upload" : "settings")}>
              {view === "settings" ? "Close" : "Settings"}
            </button>
          </>
        )}
      </header>

      <main className="main">
        {view === "booting" && (
          <div className="center">
            <div className="stack" style={{ marginTop: 60 }}>
              <p className="muted"><span className="spinner" /> Starting up…</p>
            </div>
          </div>
        )}

        {view === "onboard" && <KeyOnboarding onReady={() => setView("upload")} />}

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

        {view === "report-failed" && (
          <div className="center">
            <div className="stack" style={{ marginTop: 60 }}>
              <span className="eyebrow">Report</span>
              <h1 className="serif-title">That didn't go through.</h1>
              {error && <div className="notice reveal">{error}</div>}
              <p className="muted">
                Your interview is safe — only the write-up call failed. Retrying doesn't repeat the
                interview, just the evaluation.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-live" style={{ width: "auto" }} onClick={produceReport}>
                  Retry report
                </button>
                <button className="btn btn-ghost" onClick={() => setView("brief")}>Back</button>
              </div>
            </div>
          </div>
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

              <div className="reveal panel">
                <span className="eyebrow">Camera</span>
                <label
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={useCamera}
                    onChange={(e) => setUseCamera(e.target.checked)}
                    style={{ width: "auto", marginTop: 3 }}
                  />
                  <span className="small">
                    Interview on camera. Your interviewer can see you and reacts like a real one —
                    which is also what makes it feel like a real interview.
                    <span className="faint" style={{ display: "block", marginTop: 4 }}>
                      Still frames go to Google's API under your own key, a few times a minute.
                      Nothing is recorded or stored. You can turn it off at any point.
                    </span>
                  </span>
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
              {notice && <div className="notice info" style={{ marginTop: 12 }}>{notice}</div>}
            </aside>

            <section>
              <VideoStage
                camera={cameraStream}
                screen={screenStream}
                speaking={speaking}
                onToggleCamera={toggleCamera}
                onToggleScreen={toggleScreen}
                screenSupported={screenCaptureSupported()}
              />
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
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 28px", borderBottom: "1px solid var(--line)" }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  // The voice session is still live underneath — go back to talking.
                  setProblem(null);
                  setVerdict(null);
                  setView("live");
                }}
              >
                ← Back to interview
              </button>
              <div className="spacer" style={{ flex: 1 }} />
              {notice && <span className="faint small">{notice}</span>}
              {/* Without this, starting a coding round used to make the report
                  permanently unreachable — finish() lived only in the live view. */}
              <button className="btn" onClick={finish}>End &amp; get report</button>
            </div>
            <CodingRound
              problem={problem}
              phase={codePhase}
              onReadyToCode={readyToCode}
              onSubmit={submitCode}
              sharingScreen={Boolean(screenStream)}
              onShareScreen={screenCaptureSupported() ? toggleScreen : undefined}
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
