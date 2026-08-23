/**
 * Groq model selection.
 *
 * Why not Llama, which is what Groq is best known for: Groq deprecated
 * llama-3.3-70b-versatile and llama-3.1-8b-instant with a shutdown date of
 * 2026-08-16 for free and developer tier keys, which is the tier every BYOK
 * user of this app is on. Building the reasoning role on them would ship a
 * provider that is already dead. Groq's own recommended replacements are the
 * gpt-oss models, and they have a concrete advantage here: they are the only
 * models on Groq that support strict schema-constrained decoding, which is
 * exactly what the assessment path needs.
 *
 * Docs: https://console.groq.com/docs/deprecations
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Reasoning role: resume structuring, JD extraction, report generation.
 * The larger model, because these calls run off the interview's critical
 * path and quality matters more than milliseconds.
 */
export const GROQ_REASONING_MODEL = "openai/gpt-oss-120b";
export const GROQ_REASONING_FALLBACKS = ["openai/gpt-oss-20b"];

/**
 * Answer assessment runs *during* the interview, so it takes the smaller,
 * faster model — the same trade already made on the Gemini side, where
 * flash-lite matched flash on the judgement fixtures at 2.4x the speed.
 */
export const GROQ_ASSESSMENT_MODEL = "openai/gpt-oss-20b";
export const GROQ_ASSESSMENT_FALLBACKS = ["openai/gpt-oss-120b"];
