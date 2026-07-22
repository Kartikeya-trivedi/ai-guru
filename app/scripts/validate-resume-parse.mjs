/**
 * Phase 2 validation — resume extraction + structuring against real resumes.
 *
 * Uses the same pdf.js line-reconstruction logic and the same prompt/schema
 * as the app, driven from Node so it runs unattended.
 *
 * Usage: node scripts/validate-resume-parse.mjs
 *
 * NOTE: reads from ../testdata (gitignored — real resumes are PII).
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTDATA = join(__dirname, "..", "..", "testdata");

function loadEnv() {
  const text = readFileSync(join(__dirname, "..", ".env"), "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const API_KEY = loadEnv().GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash";

// --- mirror of src/resume/extract.ts line reconstruction ---
async function extractPdfText(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform;
      const key = Math.round(y);
      const row = rows.get(key) ?? [];
      row.push({ x, s: item.str });
      rows.set(key, row);
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, frags]) =>
        frags.sort((a, b) => a.x - b.x).map((f) => f.s).join(" ").replace(/\s+/g, " ").trim(),
      )
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }
  await task.destroy();
  return pages.join("\n\n");
}

// --- mirror of src/resume/parse.ts ---
const RESUME_SCHEMA = JSON.parse(
  readFileSync(join(__dirname, "resume-schema.json"), "utf8"),
);

const SYSTEM = `You are a senior engineer preparing to interview a candidate. You have their resume in front of you.

Extract the structured content faithfully — do not invent anything not present in the text. If a field is absent, use an empty array or omit it.

For each project, also fill "probeAngles": 2-4 specific things you would drill into during the interview. Good probe angles target where real understanding hides:
- architecture choices and the alternatives not taken
- claims that sound impressive but are unquantified or vague
- what likely broke or was hard, and how they would have debugged it
- trade-offs the design implies

Write probeAngles as short interviewer notes to yourself, e.g. "Says 'reduced latency 40%' — ask how it was measured and what the baseline was." Be skeptical but fair: these are the threads a good interviewer pulls, not accusations.`;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function parseResume(rawText, model) {
  const maxAttempts = 4;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: `Resume text:\n\n${rawText}` }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: RESUME_SCHEMA,
          },
        }),
      },
    );
    if (res.ok) {
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return JSON.parse(text);
    }
    lastError = `Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (!RETRYABLE.has(res.status) || attempt === maxAttempts) throw new Error(lastError);
    process.stdout.write(`(retry ${attempt}: ${res.status}) `);
    await sleep(500 * 2 ** (attempt - 1) + Math.random() * 250);
  }
  throw new Error(lastError);
}

const files = readdirSync(TESTDATA).filter((f) => f.endsWith(".pdf"));
if (files.length === 0) {
  console.error(`No PDFs in ${TESTDATA}`);
  process.exit(1);
}

let allPass = true;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const buf = readFileSync(join(TESTDATA, file));
  const text = await extractPdfText(buf);
  console.log(`  extracted: ${text.length} chars, ${text.split("\n").length} lines`);

  if (text.length < 200) {
    console.log("  FAIL: extraction produced almost no text");
    allPass = false;
    continue;
  }

  const t0 = performance.now();
  let parsed;
  let usedModel = MODEL;
  try {
    parsed = await parseResume(text, MODEL);
  } catch (e) {
    // Record which model actually served the request — model availability
    // is a real product risk for a BYOK app on free-tier keys.
    console.log(`  ${MODEL} unavailable (${String(e).slice(0, 60)}…), falling back`);
    usedModel = FALLBACK_MODEL;
    parsed = await parseResume(text, FALLBACK_MODEL);
  }
  const ms = Math.round(performance.now() - t0);

  const checks = {
    "has name": Boolean(parsed.name),
    "has projects": (parsed.projects?.length ?? 0) > 0,
    "has skills": (parsed.skills?.length ?? 0) > 0,
    "every project has probeAngles": (parsed.projects ?? []).every(
      (p) => (p.probeAngles?.length ?? 0) >= 2,
    ),
  };
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) allPass = false;
  }

  console.log(`  parsed in ${ms}ms via ${usedModel}`);
  console.log(`  name: ${parsed.name}`);
  console.log(`  experience: ${parsed.experience?.length ?? 0}, projects: ${parsed.projects?.length ?? 0}, skills: ${parsed.skills?.length ?? 0}`);
  console.log(`\n  Sample probe angles (the differentiator — are these good questions?):`);
  for (const p of (parsed.projects ?? []).slice(0, 2)) {
    console.log(`   • ${p.name}`);
    for (const a of p.probeAngles ?? []) console.log(`       - ${a}`);
  }
}

console.log(`\n${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
process.exit(allPass ? 0 : 1);
