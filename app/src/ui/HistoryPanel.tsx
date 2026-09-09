import { useEffect, useState } from "react";
import * as db from "../db";

export function HistoryPanel({ onResume, onSession }: {
  onResume: (resume: db.ResumeRow) => void;
  onSession: (session: db.SessionRow, resume: db.ResumeRow) => Promise<void>;
}) {
  const [resumes, setResumes] = useState<db.ResumeRow[]>([]);
  const [sessions, setSessions] = useState<db.SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([db.listResumes(), db.listSessions()]).then(([r, s]) => {
      if (!cancelled) { setResumes(r); setSessions(s); }
    }).catch(() => { if (!cancelled) setError("Couldn't open your saved interviews. Try opening History again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const open = async (session: db.SessionRow) => {
    const resume = resumes.find(r => r.id === session.resumeId);
    if (!resume) return;
    setBusy(session.id); setError("");
    try { await onSession(session, resume); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  return <div className="center"><div className="stack">
    <div><span className="eyebrow">Your practice</span><h1 className="serif-title">Pick up where you left off.</h1>
      <p className="muted">Revisit feedback, recover a write-up, or practice again with a saved resume.</p></div>
    {error && <div className="notice" role="alert">{error}</div>}
    {loading && <p className="muted">Loading your interviews…</p>}
    {!loading && !resumes.length && <div className="panel">Your saved interviews will appear here after you upload a resume.</div>}
    {sessions.map(s => <div className="panel history-item" key={s.id}>
      <div><strong>{s.jobTarget.role} · {s.jobTarget.seniority}</strong>
        <p className="muted small">{s.candidateName} · {new Date(s.startedAt).toLocaleString()}</p>
        <span className="eyebrow">{s.hasReport ? "Report ready" : "No report saved"}</span></div>
      <button className="btn" disabled={busy !== null} onClick={() => void open(s)}>{busy === s.id ? "Opening…" : s.hasReport ? "View report" : "Recover report"}</button>
    </div>)}
    {resumes.length > 0 && <span className="eyebrow">Saved resumes</span>}
    {resumes.map(r => <div className="panel history-item" key={r.id}>
      <div><strong>{r.name}</strong><p className="muted small">Added {new Date(r.createdAt).toLocaleDateString()}</p></div>
      <button className="btn" onClick={() => onResume(r)}>Practice again</button>
    </div>)}
  </div></div>;
}
