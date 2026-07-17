/**
 * Final evaluation report — not "8/10", a structured assessment built from
 * the transcript, threads (topics × depth × quality), and candidate model.
 */

export interface DimensionScore {
  /** 1–5 with written justification; never a bare number. */
  score: 1 | 2 | 3 | 4 | 5;
  justification: string;
  evidence: string[]; // quotes/moments from the transcript
}

export interface InterviewReport {
  sessionId: string;
  projectDepth: DimensionScore;
  technicalKnowledge: DimensionScore;
  behavioralFit: DimensionScore;
  communication: DimensionScore;
  strengths: string[];
  weaknesses: string[];
  /** Overall readiness verdict, e.g. "ready for mid-level ML roles; not yet senior". */
  interviewReadiness: string;
  actionableImprovements: string[];
  createdAt: string;
}
