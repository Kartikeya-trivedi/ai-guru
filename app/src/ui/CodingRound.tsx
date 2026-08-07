import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { canExecute, type Language, type RunOutcome } from "../dsa/harness";
import { availableLanguages, runSolution } from "../dsa/run";
import { inDesktopApp } from "../providers/keys";
import type { Problem } from "../dsa/problems";

/**
 * The DSA round, shaped like a real coding interview rather than a judge.
 *
 * Phase 1 — TALK. The problem appears; the Run button does not. You discuss
 * approach, complexity and edge cases with the interviewer first, and only
 * then get the editor. This ordering is the point: interviewers learn more
 * from how you plan than from whether you typed a working loop, and a
 * candidate who codes first has skipped the part being assessed.
 *
 * Phase 2 — CODE. Editor unlocked, interviewer still listening.
 */

const LABELS: Record<Language, string> = {
  python: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

const MONACO_LANG: Record<Language, string> = {
  python: "python",
  javascript: "javascript",
  cpp: "cpp",
  java: "java",
};

export function CodingRound({
  problem,
  onSubmit,
  phase,
  onReadyToCode,
  sharingScreen,
  onShareScreen,
}: {
  problem: Problem;
  phase: "discuss" | "code";
  onReadyToCode: () => void;
  onSubmit: (language: Language, source: string, outcome?: RunOutcome) => void;
  /** Whether the interviewer can currently see the candidate's screen. */
  sharingScreen?: boolean;
  onShareScreen?: () => void;
}) {
  const [language, setLanguage] = useState<Language>("python");
  const [source, setSource] = useState("");
  // Bind the run result to the exact source+language that produced it. Any
  // later edit makes it stale — submitting stale results would hand the judge
  // and the interviewer a verdict about code the candidate no longer has.
  const [run, setRun] = useState<{ source: string; language: Language; result: RunOutcome } | null>(null);
  const [running, setRunning] = useState(false);
  const [installed, setInstalled] = useState<Language[] | null>(null);

  useEffect(() => {
    if (!inDesktopApp()) return setInstalled(null);
    void availableLanguages().then(setInstalled);
  }, []);

  useEffect(() => {
    setSource(problem.signatures[language]);
    setRun(null);
  }, [problem, language]);

  // Only fresh if it matches what's in the editor right now.
  const outcome = run && run.source === source && run.language === language ? run.result : null;
  const staleRun = run !== null && outcome === null;

  const samples = useMemo(() => problem.testCases.filter((c) => c.sample), [problem]);

  const runnable = canExecute(language) && inDesktopApp() && (installed?.includes(language) ?? false);
  const runBlockedReason = !inDesktopApp()
    ? "Running code needs the desktop app."
    : !canExecute(language)
      ? `${LABELS[language]} is reviewed by your interviewer — automatic test runs aren't supported for it yet.`
      : installed && !installed.includes(language)
        ? `${LABELS[language]} isn't installed on this machine.`
        : null;

  const runTests = async () => {
    setRunning(true);
    // Capture the exact source this run judges, so a later edit invalidates it.
    const ranSource = source;
    const ranLanguage = language;
    try {
      const result = await runSolution(problem, ranLanguage, ranSource);
      setRun({ source: ranSource, language: ranLanguage, result });
    } catch (e) {
      setRun({
        source: ranSource,
        language: ranLanguage,
        result: {
          results: [],
          passed: 0,
          total: problem.testCases.length,
          compileError: e instanceof Error ? e.message : String(e),
          timedOut: false,
          runtimeMissing: false,
          raw: { stdout: "", stderr: "" },
        },
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="split">
      <aside>
        <span className="eyebrow">
          {problem.difficulty} · {problem.topic.replace("-", " ")}
        </span>
        <h2 className="serif-title" style={{ fontSize: 21, marginTop: 6 }}>{problem.title}</h2>

        <div className="muted small" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {problem.statement}
        </div>

        {samples.length > 0 && (
          <>
            <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>Examples</span>
            {samples.map((s, i) => (
              <div key={i} className="evidence" style={{ marginTop: 8 }}>
                <div>in &nbsp;{JSON.stringify(s.input)}</div>
                <div>out {JSON.stringify(s.expected)}</div>
              </div>
            ))}
          </>
        )}

        <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>Constraints</span>
        <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
          {problem.constraints.map((c, i) => (
            <li key={i} className="faint small mono" style={{ margin: "3px 0" }}>{c}</li>
          ))}
        </ul>
      </aside>

      <section>
        {phase === "discuss" ? (
          <div style={{ maxWidth: 560 }}>
            <span className="eyebrow">Before you write anything</span>
            <h2 className="serif-title" style={{ marginTop: 8 }}>Talk me through it first.</h2>
            <p className="muted" style={{ marginTop: 10 }}>
              How would you approach this? What's the complexity you're aiming for, and what edge cases
              are you worried about? This is the part a real interviewer is actually listening to — the
              editor unlocks when you've made your case.
            </p>
            <div className="notice info" style={{ marginTop: 16 }}>
              Answer out loud. Your interviewer will push back before letting you code.
            </div>
            <button className="btn btn-live" style={{ marginTop: 20 }} onClick={onReadyToCode}>
              I've explained my approach — let me code
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                style={{ width: 150 }}
              >
                {(Object.keys(LABELS) as Language[]).map((l) => (
                  <option key={l} value={l}>{LABELS[l]}</option>
                ))}
              </select>
              <button className="btn" disabled={!runnable || running} onClick={runTests}>
                {running ? <span className="spinner" /> : "Run tests"}
              </button>
              <div className="spacer" style={{ flex: 1 }} />
              <button
                className="btn btn-live"
                style={{ width: "auto" }}
                // Pass only a FRESH outcome. If the code changed since the last
                // run, submit with no results so the judge treats it as
                // unexecuted rather than trusting a stale verdict.
                onClick={() => onSubmit(language, source, outcome ?? undefined)}
              >
                Submit
              </button>
            </div>

            {/* Sharing matters most here: a real interviewer watches you write,
                and reacts to the code rather than only to the finished answer. */}
            {onShareScreen && !sharingScreen && (
              <div className="notice info" style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ flex: 1 }}>
                  Share your screen so your interviewer can follow your thinking as you write, the way
                  they would in a real round.
                </span>
                <button className="btn" style={{ marginTop: 0, flexShrink: 0 }} onClick={onShareScreen}>
                  Share screen
                </button>
              </div>
            )}

            {runBlockedReason && (
              <div className="notice info" style={{ marginBottom: 12 }}>{runBlockedReason}</div>
            )}

            {staleRun && (
              <div className="notice info" style={{ marginBottom: 12 }}>
                You've edited the code since the last run. Re-run before submitting, or submit and your
                interviewer will review it by reading rather than test results.
              </div>
            )}

            <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
              <Editor
                height="46vh"
                language={MONACO_LANG[language]}
                theme="vs-dark"
                value={source}
                onChange={(v) => setSource(v ?? "")}
                options={{
                  fontSize: 13,
                  fontFamily: "IBM Plex Mono, monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  renderLineHighlight: "none",
                }}
              />
            </div>

            {outcome && (
              <div className="panel" style={{ marginTop: 12 }}>
                {outcome.compileError ? (
                  <>
                    <span className="eyebrow" style={{ color: "var(--bad)" }}>Didn't run</span>
                    <pre className="evidence" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {outcome.compileError}
                    </pre>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">
                      {outcome.passed}/{outcome.total} tests passed
                    </span>
                    <div style={{ marginTop: 10 }}>
                      {outcome.results.map((r) => (
                        <div key={r.index} className="evidence" style={{ marginTop: 6 }}>
                          <span style={{ color: r.passed ? "var(--good)" : "var(--bad)" }}>
                            {r.passed ? "pass" : "fail"}
                          </span>{" "}
                          case {r.index + 1}
                          {!r.passed && !r.error && (
                            <> · expected {JSON.stringify(r.expected)}, got {JSON.stringify(r.actual)}</>
                          )}
                          {r.error && <> · {r.error}</>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
