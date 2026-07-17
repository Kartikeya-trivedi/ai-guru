/**
 * Resume as the interviewer's memory: parsed into typed sections and stored
 * locally (SQLite) so the engine can target — e.g. pick the two most
 * technically interesting projects for the deep-dive stage.
 */

export interface ResumeExperience {
  company: string;
  role: string;
  period: string;
  highlights: string[];
}

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
  /** Filled by the reasoning model: what a senior interviewer would probe. */
  probeAngles?: string[];
}

export interface ParsedResume {
  name: string;
  summary?: string;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
  education: { institution: string; degree: string; period: string }[];
}

export interface ResumeRecord {
  id: string;
  rawText: string;
  parsed: ParsedResume;
  createdAt: string;
}
