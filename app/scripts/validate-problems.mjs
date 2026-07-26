/**
 * Phase 4 validation — is the problem bank's test data actually CORRECT?
 *
 * Wrong expected values would fail a candidate's correct solution. That is
 * the worst bug this product can ship: it destroys trust in the one thing
 * the customer is paying us to judge. Hand-tracing doesn't scale and
 * "the author says they checked" is not evidence.
 *
 * So: for each problem, have a model write a reference solution from the
 * statement alone (it never sees the expected outputs), then EXECUTE it
 * against the test cases. If an independently-written correct solution
 * disagrees with our expected values, the test data is suspect.
 *
 * This can produce false alarms (the model may write a wrong solution), so
 * failures are reported for human review rather than treated as proof — but
 * a problem where the reference passes all cases is strong evidence the data
 * is sound.
 *
 * Usage: node scripts/validate-problems.mjs [problem-id]
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];

// Load the bank by stripping types — avoids adding a TS build step here.
async function loadProblems() {
  const src = readFileSync(join(__dirname, "..", "src", "dsa", "problems.ts"), "utf8");
  const start = src.indexOf("[", src.indexOf("PROBLEMS"));
  const body = src.slice(start, src.lastIndexOf("]") + 1);
  const json = body
    .replace(/\bas const\b/g, "")
    .replace(/,(\s*[\]}])/g, "$1");
  return eval(json);
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askForSolution(problem) {
  const prompt = `Write a correct, efficient Python solution.

${problem.title}
${problem.statement}

Constraints:
${problem.constraints.map((c) => `- ${c}`).join("\n")}

Signature you must implement exactly:
${problem.signatures.python}

Target complexity: ${problem.optimalComplexity}

Output ONLY the Python function (plus any imports/helpers). No markdown fences, no explanation, no test code.`;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0 },
          }),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        return text.replace(/^```(?:python)?\s*/m, "").replace(/```\s*$/m, "").trim();
      }
      if (!RETRYABLE.has(res.status)) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error("no model could produce a reference solution");
}

function fnNameFrom(signature) {
  const m = signature.match(/def\s+([A-Za-z_]\w*)/);
  if (!m) throw new Error(`no function name in: ${signature}`);
  return m[1];
}

function runPython(source, fnName, cases) {
  const dir = mkdtempSync(join(tmpdir(), "probval-"));
  try {
    const driver = `${source}

import sys, json
_cases = json.loads(sys.stdin.read())
_out = []
for _i, _c in enumerate(_cases):
    try:
        _out.append({"index": _i, "value": ${fnName}(*_c["input"])})
    except Exception as _e:
        _out.append({"index": _i, "error": f"{type(_e).__name__}: {_e}"})
print("___RESULTS___" + json.dumps(_out))`;
    const file = join(dir, "sol.py");
    writeFileSync(file, driver, "utf8");
    const stdout = execFileSync("python", [file], {
      input: JSON.stringify(cases.map((c) => ({ input: c.input }))),
      encoding: "utf8",
      timeout: 20000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const idx = stdout.indexOf("___RESULTS___");
    if (idx === -1) throw new Error("no results marker");
    return JSON.parse(stdout.slice(idx + "___RESULTS___".length));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i]) && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// ── structural checks: cheap, deterministic, catch authoring slips ──
function structural(problems) {
  const problems_ = problems;
  const issues = [];
  const ids = new Set();
  for (const p of problems_) {
    const where = p.id ?? p.title ?? "(unnamed)";
    if (ids.has(p.id)) issues.push(`${where}: duplicate id`);
    ids.add(p.id);
    if ((p.testCases?.length ?? 0) < 6) issues.push(`${where}: only ${p.testCases?.length ?? 0} test cases (need >= 6)`);
    const samples = (p.testCases ?? []).filter((c) => c.sample).length;
    if (samples !== 2) issues.push(`${where}: ${samples} sample cases (need exactly 2)`);
    for (const lang of ["python", "javascript", "cpp", "java"]) {
      if (!p.signatures?.[lang]) issues.push(`${where}: missing ${lang} signature`);
    }
    if ((p.discussionAngles?.length ?? 0) < 3) issues.push(`${where}: ${p.discussionAngles?.length ?? 0} discussion angles (need >= 3)`);
    if ((p.edgeCases?.length ?? 0) < 2) issues.push(`${where}: ${p.edgeCases?.length ?? 0} edge cases (need >= 2)`);
    if (!p.optimalComplexity) issues.push(`${where}: no optimalComplexity`);
  }
  return issues;
}

const problems = await loadProblems();
const only = process.argv[2];
const targets = only ? problems.filter((p) => p.id === only) : problems;

console.log(`Problem bank: ${problems.length} problems\n`);

const byTopic = {};
const byDiff = {};
for (const p of problems) {
  byTopic[p.topic] = (byTopic[p.topic] ?? 0) + 1;
  byDiff[p.difficulty] = (byDiff[p.difficulty] ?? 0) + 1;
}
console.log("  topics:", JSON.stringify(byTopic));
console.log("  difficulty:", JSON.stringify(byDiff));

console.log("\n── structural ──");
const issues = structural(problems);
if (issues.length === 0) console.log("  PASS  all problems well-formed");
else for (const i of issues) console.log(`  FAIL  ${i}`);

console.log("\n── test-data correctness (reference solution vs expected) ──");
const suspect = [];
let verified = 0;

for (const p of targets) {
  process.stdout.write(`  ${p.id.padEnd(34)} `);
  try {
    const source = await askForSolution(p);
    const results = runPython(source, fnNameFrom(p.signatures.python), p.testCases);
    const bad = [];
    p.testCases.forEach((c, i) => {
      const r = results.find((x) => x.index === i);
      if (!r) return bad.push(`case ${i + 1}: no result`);
      if (r.error) return bad.push(`case ${i + 1}: ${r.error}`);
      if (!deepEqual(r.value, c.expected)) {
        bad.push(`case ${i + 1}: expected ${JSON.stringify(c.expected)}, reference produced ${JSON.stringify(r.value)}`);
      }
    });
    if (bad.length === 0) {
      verified++;
      console.log("VERIFIED");
    } else {
      suspect.push({ id: p.id, bad });
      console.log(`SUSPECT (${bad.length}/${p.testCases.length})`);
      for (const b of bad.slice(0, 3)) console.log(`        ${b}`);
    }
  } catch (e) {
    console.log(`SKIP — ${String(e).slice(0, 70)}`);
  }
}

console.log(`\n${verified}/${targets.length} problems verified against an independent reference solution.`);
if (suspect.length) {
  console.log(`\n${suspect.length} need human review (the reference may itself be wrong — check by hand):`);
  for (const s of suspect) console.log(`  - ${s.id}`);
}
process.exit(issues.length === 0 && suspect.length === 0 ? 0 : 1);
