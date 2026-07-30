import Database from "@tauri-apps/plugin-sql";
import type { ParsedResume } from "../resume/types";
import type { JobTarget, Thread } from "../engine/types";
import type { InterviewReport } from "../report/types";

/**
 * Local-first storage. Resume sections, sessions, transcripts, threads and
 * reports never leave the machine — the only network traffic this product
 * makes is the provider calls the user's own key pays for.
 *
 * Schema and migrations live in src-tauri/src/lib.rs (the plugin owns them).
 */

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  db ??= await Database.load("sqlite:interview.db");
  return db;
}

/** Crypto-random id; avoids collisions across concurrent sessions. */
export function newId(): string {
  return crypto.randomUUID();
}

// ── resumes ──────────────────────────────────────────────────────────

export interface ResumeRow {
  id: string;
  name: string;
  parsed: ParsedResume;
  createdAt: string;
}

export async function saveResume(
  rawText: string,
  parsed: ParsedResume,
): Promise<ResumeRow> {
  const row: ResumeRow = {
    id: newId(),
    name: parsed.name,
    parsed,
    createdAt: new Date().toISOString(),
  };
  const d = await getDb();
  await d.execute(
    "INSERT INTO resumes (id, name, raw_text, parsed_json, created_at) VALUES ($1,$2,$3,$4,$5)",
    [row.id, row.name, rawText, JSON.stringify(parsed), row.createdAt],
  );
  return row;
}

export async function listResumes(): Promise<ResumeRow[]> {
  const d = await getDb();
  const rows = await d.select<{ id: string; name: string; parsed_json: string; created_at: string }[]>(
    "SELECT id, name, parsed_json, created_at FROM resumes ORDER BY created_at DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parsed: JSON.parse(r.parsed_json) as ParsedResume,
    createdAt: r.created_at,
  }));
}

export async function deleteResume(id: string): Promise<void> {
  const d = await getDb();
  // Sessions/turns/threads/reports cascade — the user deleting their resume
  // means deleting their data, not orphaning it.
  await d.execute("DELETE FROM resumes WHERE id = $1", [id]);
}

// ── sessions ─────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  resumeId: string;
  candidateName: string;
  jobTarget: JobTarget;
  startedAt: string;
  endedAt: string | null;
  hasReport: boolean;
}

export async function createSession(
  resumeId: string,
  jobTarget: JobTarget,
): Promise<string> {
  const id = newId();
  const d = await getDb();
  await d.execute(
    "INSERT INTO sessions (id, resume_id, config_json, started_at) VALUES ($1,$2,$3,$4)",
    [id, resumeId, JSON.stringify({ jobTarget }), new Date().toISOString()],
  );
  return id;
}

export async function endSession(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE sessions SET ended_at = $1 WHERE id = $2", [
    new Date().toISOString(),
    id,
  ]);
}

export async function listSessions(): Promise<SessionRow[]> {
  const d = await getDb();
  const rows = await d.select<
    {
      id: string;
      resume_id: string;
      name: string;
      config_json: string;
      started_at: string;
      ended_at: string | null;
      report_count: number;
    }[]
  >(`SELECT s.id, s.resume_id, r.name, s.config_json, s.started_at, s.ended_at,
            (SELECT COUNT(*) FROM reports rp WHERE rp.session_id = s.id) AS report_count
     FROM sessions s JOIN resumes r ON r.id = s.resume_id
     ORDER BY s.started_at DESC`);
  return rows.map((r) => ({
    id: r.id,
    resumeId: r.resume_id,
    candidateName: r.name,
    jobTarget: (JSON.parse(r.config_json).jobTarget ?? {}) as JobTarget,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    hasReport: r.report_count > 0,
  }));
}

// ── turns ────────────────────────────────────────────────────────────

export async function saveTurn(
  sessionId: string,
  role: "user" | "assistant",
  text: string,
  stage: string,
): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO turns (session_id, role, text, stage, ts) VALUES ($1,$2,$3,$4,$5)",
    [sessionId, role, text, stage, new Date().toISOString()],
  );
}

export async function loadTurns(
  sessionId: string,
): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const d = await getDb();
  const rows = await d.select<{ role: string; text: string }[]>(
    "SELECT role, text FROM turns WHERE session_id = $1 ORDER BY id ASC",
    [sessionId],
  );
  return rows.map((r) => ({ role: r.role as "user" | "assistant", text: r.text }));
}

// ── threads ──────────────────────────────────────────────────────────

export async function saveThreads(sessionId: string, threads: Thread[]): Promise<void> {
  const d = await getDb();
  for (const t of threads) {
    // Threads mutate as the interview drills, so upsert rather than insert.
    // Thread ids are UUIDs (collision-free across runs), but the WHERE guard
    // is defence in depth: even a colliding id can never overwrite a row that
    // belongs to a DIFFERENT session — the UPDATE simply no-ops.
    await d.execute(
      `INSERT INTO threads (id, session_id, stage, topic, depth, exhausted, assessments_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET depth = $5, exhausted = $6, assessments_json = $7
       WHERE threads.session_id = $2`,
      [t.id, sessionId, t.stage, t.topic, t.depth, t.exhausted ? 1 : 0, JSON.stringify(t.assessments)],
    );
  }
}

export async function loadThreads(sessionId: string): Promise<Thread[]> {
  const d = await getDb();
  const rows = await d.select<
    {
      id: string;
      stage: string;
      topic: string;
      depth: number;
      exhausted: number;
      assessments_json: string;
    }[]
  >("SELECT * FROM threads WHERE session_id = $1", [sessionId]);
  return rows.map((r) => ({
    id: r.id,
    stage: r.stage as Thread["stage"],
    topic: r.topic,
    depth: r.depth,
    exhausted: r.exhausted === 1,
    assessments: JSON.parse(r.assessments_json),
  }));
}

// ── reports ──────────────────────────────────────────────────────────

export async function saveReport(report: InterviewReport): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO reports (session_id, report_json, created_at) VALUES ($1,$2,$3)
     ON CONFLICT(session_id) DO UPDATE SET report_json = $2, created_at = $3`,
    [report.sessionId, JSON.stringify(report), report.createdAt],
  );
}

export async function loadReport(sessionId: string): Promise<InterviewReport | null> {
  const d = await getDb();
  const rows = await d.select<{ report_json: string }[]>(
    "SELECT report_json FROM reports WHERE session_id = $1",
    [sessionId],
  );
  return rows.length ? (JSON.parse(rows[0].report_json) as InterviewReport) : null;
}
