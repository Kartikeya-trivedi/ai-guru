/**
 * Model selection, with the measured rationale for each choice.
 * See docs/VALIDATION.md for the numbers behind these.
 */

/** Realtime voice interviewer. 544ms to first audio — clears the 800ms budget. */
export const LIVE_MODEL = "gemini-3.1-flash-live-preview";

/**
 * Reasoning role: resume structuring, answer assessment, report generation.
 * 3.5-flash is preferred for quality but was fully saturated (503 on every
 * retry) during validation; 2.5-flash served the same work reliably.
 */
export const REASONING_MODEL = "gemini-3.5-flash";
export const REASONING_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
