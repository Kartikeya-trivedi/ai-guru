import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { ReportInput } from "../report/generate";

// Exercise real SQLite and the actual shipped schema; replace only the Tauri transport.
const connection = vi.hoisted(() => ({ current: null as unknown as DatabaseSync }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: {
  load: async () => ({
    execute: async (sql: string, values: unknown[] = []) => connection.current.prepare(sql).run(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v])) as never),
    select: async (sql: string, values: unknown[] = []) => connection.current.prepare(sql).all(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v])) as never),
  }),
} }));
afterEach(() => connection.current?.close());
describe("saved report recovery", () => {
  it("round-trips a report draft and preserves the target role after reopening storage", async () => {
    connection.current = new DatabaseSync(":memory:");
    const rust = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const schema = rust.match(/sql: r#"([\s\S]*?)"#/);
    expect(schema).not.toBeNull();
    connection.current.exec(schema![1]);
    const db = await import("./index");
    const resume = await db.saveResume("Example resume", { name: "Candidate", projects: [], skills: [], experience: [], education: [] });
    const target = { role: "Backend Engineer", seniority: "mid" as const };
    const sid = await db.createSession(resume.id, target);
    expect(await db.loadReportDraft(sid)).toBeNull();
    const input: ReportInput = { sessionId: sid, candidateName: resume.name, jobTarget: target, threads: [],
      candidateModel: { claims: [], exposedGaps: [], verifiedStrengths: [], communicationNotes: [] },
      transcript: [{ role: "user", text: "A quote with 'apostrophes' and unicode: café" }],
    };
    await db.saveReportDraft(input);
    // A fresh module simulates losing all React/module state on app restart.
    vi.resetModules();
    const reopened = await import("./index");
    expect(await reopened.loadReportDraft(sid)).toEqual(input);
    expect((await reopened.listSessions())[0].jobTarget).toEqual(target);
    expect((await reopened.listResumes())[0].id).toBe(resume.id);
  });
});
