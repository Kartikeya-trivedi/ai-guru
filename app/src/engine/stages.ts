import type { StageDefinition } from "./types";

/**
 * The default interview: how an experienced interviewer structures an hour.
 * Objectives are written as what the interviewer wants to LEARN — they are
 * injected into the conversation model's context at each stage transition.
 */
export const DEFAULT_STAGES: StageDefinition[] = [
  {
    id: "intro",
    objective:
      "Put the candidate at ease and get their own framing of who they are. " +
      "Listen for: what they lead with, clarity, self-awareness. Do not probe yet.",
    targetMinutes: 4,
  },
  {
    id: "resume",
    objective:
      "Walk the resume chronologically. Verify the story hangs together: why each " +
      "move, what they actually owned vs. what the team did. Flag anything vague " +
      "or inflated as a probe target for the next stage.",
    targetMinutes: 8,
  },
  {
    id: "projects",
    objective:
      "Pick the 1–2 most technically interesting projects and drill: why this " +
      "architecture, why not the alternative, what failed, how it was debugged, " +
      "what trade-offs were made. Go layer by layer until the candidate reaches " +
      "the limit of their understanding.",
    targetMinutes: 18,
  },
  {
    id: "technical",
    objective:
      "Test fundamentals adjacent to their claimed skills, then one applied " +
      "problem (DSA or system design as appropriate). Assess reasoning process, " +
      "not just the final answer.",
    targetMinutes: 18,
  },
  {
    id: "behavioral",
    objective:
      "Conflict, failure, feedback, collaboration. Demand specific stories, not " +
      "hypotheticals; push for the candidate's own actions and what they'd do differently.",
    targetMinutes: 8,
  },
  {
    id: "wrapup",
    objective:
      "Let the candidate ask questions; close warmly. No new evaluation signal " +
      "expected — the report is generated after this stage.",
    targetMinutes: 4,
  },
];
