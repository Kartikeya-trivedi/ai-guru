import { describe, it, expect } from "vitest";
import { applyCoverage, REPORT_SCHEMA } from "./generate";
import { toStrictSchema } from "../providers/schema";
import type { InterviewReport } from "./types";
import type { Thread, StageId } from "../engine/types";

const dimension = { score: 4 as const, justification: "Clear answer", evidence: ["Explained the trade-off"] };
const report: Omit<InterviewReport, "sessionId" | "createdAt"> = {
  projectDepth: dimension, technicalKnowledge: dimension, behavioralFit: dimension, communication: dimension,
  strengths: [], weaknesses: [], interviewReadiness: "Ready for senior roles", actionableImprovements: [],
};
const thread = (stage: StageId, count = 2): Thread => ({
  id: stage, stage, topic: "Example", depth: count, exhausted: false,
  assessments: Array.from({ length: count }, () => ({ quality: "strong", note: "Explained trade-offs" })),
});
describe("report evidence coverage", () => {
  it("does not manufacture behavioural or project scores from technical answers", () => {
    const result = applyCoverage(report, [thread("technical")]);
    expect(result.technicalKnowledge.score).toBe(4);
    expect(result.behavioralFit.score).toBeNull();
    expect(result.projectDepth.score).toBeNull();
    expect(result.interviewReadiness).toContain("not enough evidence");
    expect(report.behavioralFit.score).toBe(4);
  });
  it("leaves a one-answer interview unscored", () => {
    const result = applyCoverage(report, [thread("technical", 1)]);
    expect(result.technicalKnowledge.score).toBeNull();
    expect(result.communication.score).toBeNull();
  });
  it("requires cited evidence even when the stage was covered", () => {
    const result = applyCoverage({ ...report, technicalKnowledge: { ...dimension, evidence: [] } }, [thread("technical")]);
    expect(result.technicalKnowledge.score).toBeNull();
  });
  it("retains a fully covered report", () => {
    expect(applyCoverage(report, [thread("projects"), thread("technical"), thread("behavioral")])).toEqual(report);
  });
  it("translates nullable scores for the alternative provider", () => {
    const schema = toStrictSchema(REPORT_SCHEMA) as typeof REPORT_SCHEMA;
    expect(schema.properties.projectDepth.properties.score.type).toEqual(["integer", "null"]);
  });
});
