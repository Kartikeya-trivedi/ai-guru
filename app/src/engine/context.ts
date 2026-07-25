import type { ParsedResume } from "../resume/types";
import type { CandidateModel, JobTarget, StageDefinition } from "./types";

/**
 * Context assembly — what the interviewer "has in front of them".
 *
 * The resume is memory, not an attachment: it is injected as structured
 * sections with the probe angles already worked out, the way a real
 * interviewer arrives having read it and decided what to ask.
 */

export function resumeBrief(resume: ParsedResume): string {
  const projects = resume.projects
    .map((p, i) => {
      const angles = (p.probeAngles ?? []).map((a) => `      - ${a}`).join("\n");
      return `  ${i + 1}. ${p.name} — ${p.description}\n     Tech: ${p.technologies.join(", ")}\n     Worth probing:\n${angles}`;
    })
    .join("\n");

  const experience = resume.experience
    .map((e) => `  - ${e.role} at ${e.company} (${e.period})\n${e.highlights.map((h) => `      • ${h}`).join("\n")}`)
    .join("\n");

  return `CANDIDATE: ${resume.name}
${resume.summary ? `\nSummary: ${resume.summary}\n` : ""}
EXPERIENCE:
${experience || "  (none listed)"}

PROJECTS:
${projects || "  (none listed)"}

SKILLS: ${resume.skills.join(", ")}

EDUCATION:
${resume.education.map((e) => `  - ${e.degree}, ${e.institution} (${e.period})`).join("\n") || "  (none listed)"}`;
}

export function jobBrief(target: JobTarget): string {
  const reqs = target.extractedRequirements?.length
    ? `\nWhat this role actually needs:\n${target.extractedRequirements.map((r) => `  - ${r}`).join("\n")}`
    : "";
  return `TARGET ROLE: ${target.seniority}-level ${target.role}${reqs}

Calibrate difficulty to ${target.seniority} level, and keep technical questions relevant to this role — do not drift into trivia that a ${target.role} would never touch.`;
}

/** Injected at each stage transition to redirect the interviewer. */
export function stageBrief(stage: StageDefinition): string {
  return `[INTERVIEW STAGE: ${stage.id.toUpperCase()}]

What you are trying to learn in this stage:
${stage.objective}

Move into this stage naturally — do not announce it as a stage change. Bridge from what was just said.`;
}

export function candidateModelBrief(model: CandidateModel): string {
  if (
    !model.claims.length &&
    !model.verifiedStrengths.length &&
    !model.exposedGaps.length
  ) {
    return "";
  }
  return `[WHAT THIS INTERVIEW HAS REVEALED SO FAR]
${model.verifiedStrengths.length ? `Verified strengths: ${model.verifiedStrengths.join("; ")}` : ""}
${model.exposedGaps.length ? `Exposed gaps: ${model.exposedGaps.join("; ")}` : ""}
${model.claims.length ? `Claims made: ${model.claims.join("; ")}` : ""}

Use this to stay coherent — reference earlier answers naturally, and don't re-ask what they've already covered.`;
}
