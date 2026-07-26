import { PROBLEMS, type Difficulty, type Problem } from "./problems";
import type { JobTarget } from "../engine/types";

/**
 * Problem selection.
 *
 * Difficulty tracks the seniority being interviewed for, because an
 * "easy" problem asked of a staff candidate tells you nothing, and a hard
 * one asked of an intern tells you nothing either — both waste the round.
 */

const BY_SENIORITY: Record<JobTarget["seniority"], Difficulty[]> = {
  intern: ["easy", "easy", "medium"],
  junior: ["easy", "medium"],
  mid: ["medium", "medium", "hard"],
  senior: ["medium", "hard"],
  staff: ["hard", "medium"],
};

export function pickProblem(
  target: JobTarget,
  opts: { exclude?: string[] } = {},
): Problem | null {
  const wanted = new Set(BY_SENIORITY[target.seniority] ?? ["medium"]);
  const exclude = new Set(opts.exclude ?? []);

  const pool = PROBLEMS.filter((p) => wanted.has(p.difficulty) && !exclude.has(p.id));
  const candidates = pool.length ? pool : PROBLEMS.filter((p) => !exclude.has(p.id));
  if (!candidates.length) return null;

  // Vary across sessions — the same problem every time makes the product a
  // memorisation exercise, which is the thing it exists to defeat.
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function problemById(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
