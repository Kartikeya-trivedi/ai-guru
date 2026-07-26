import type { TestCase } from "./problems";

/**
 * Test harness: wraps the candidate's function in a driver that reads test
 * inputs as JSON on stdin and writes results as JSON on stdout.
 *
 * Why a driver rather than making the candidate handle I/O: an interview
 * tests the algorithm, not their ability to remember Scanner boilerplate.
 * They write the function; we call it.
 *
 * The driver isolates each case so one exception doesn't void the whole run
 * — a solution that passes 5/6 and throws on the empty-array case should
 * read as exactly that, which is also what the AI judge needs to see.
 */

export type Language = "python" | "javascript" | "cpp" | "java";

/**
 * Languages whose solutions we can actually RUN against test cases.
 *
 * Python and JS marshal test data as JSON in three lines of stdlib. C++ and
 * Java have no cheap stdlib JSON, so a correct harness needs per-signature
 * marshalling — real work, and a half-built one would report a *correct*
 * solution as failing. Failing a candidate unfairly is the worst bug this
 * product can have, so C++/Java are write-and-AI-judge only in V1 and the
 * UI says so plainly rather than pretending.
 *
 * V1.x: generate marshalling from each problem's typed signature.
 */
export const EXECUTABLE_LANGUAGES: Language[] = ["python", "javascript"];

export function canExecute(language: Language): boolean {
  return EXECUTABLE_LANGUAGES.includes(language);
}

export interface CaseResult {
  index: number;
  passed: boolean;
  expected: unknown;
  actual?: unknown;
  error?: string;
  durationMs?: number;
}

export interface RunOutcome {
  results: CaseResult[];
  passed: number;
  total: number;
  compileError?: string;
  timedOut: boolean;
  runtimeMissing: boolean;
  raw: { stdout: string; stderr: string };
}

export function buildDriver(
  language: Language,
  fnName: string,
  source: string,
): string {
  if (!canExecute(language)) {
    throw new Error(
      `${language} solutions are AI-judged in V1 — no test-case execution yet. Guard with canExecute() before calling.`,
    );
  }
  switch (language) {
    case "python":
      return `${source}

# --- harness ---
import sys, json, time
_cases = json.loads(sys.stdin.read())
_out = []
for _i, _c in enumerate(_cases):
    _t0 = time.perf_counter()
    try:
        _r = ${fnName}(*_c["input"])
        _out.append({"index": _i, "value": _r, "ms": (time.perf_counter() - _t0) * 1000})
    except Exception as _e:
        _out.append({"index": _i, "error": f"{type(_e).__name__}: {_e}"})
print("___RESULTS___" + json.dumps(_out))`;

    case "javascript":
      return `${source}

// --- harness ---
const _chunks = [];
process.stdin.on("data", (c) => _chunks.push(c));
process.stdin.on("end", () => {
  const cases = JSON.parse(Buffer.concat(_chunks).toString());
  const out = cases.map((c, i) => {
    const t0 = performance.now();
    try {
      return { index: i, value: ${fnName}(...c.input), ms: performance.now() - t0 };
    } catch (e) {
      return { index: i, error: String(e && e.message ? e.message : e) };
    }
  });
  process.stdout.write("___RESULTS___" + JSON.stringify(out));
});`;

    default:
      throw new Error(`no driver for ${language}`);
  }
}

/** Compare with JSON semantics; arrays are order-sensitive by default. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    // Float results (averages, medians) shouldn't fail on representation.
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return (
      ka.length === kb.length &&
      ka.every((k, i) => k === kb[i]) &&
      ka.every((k) =>
        valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    );
  }
  return false;
}

const MARKER = "___RESULTS___";

export function parseOutcome(
  stdout: string,
  stderr: string,
  cases: TestCase[],
  flags: { timedOut: boolean; runtimeMissing: boolean; exitCode: number | null },
): RunOutcome {
  const base = {
    total: cases.length,
    timedOut: flags.timedOut,
    runtimeMissing: flags.runtimeMissing,
    raw: { stdout, stderr },
  };

  if (flags.runtimeMissing) {
    return { ...base, results: [], passed: 0, compileError: stderr };
  }
  if (flags.timedOut) {
    // Almost always an infinite loop or an accidental O(2^n) — say so, since
    // "timed out" alone tells the candidate nothing.
    return {
      ...base,
      results: [],
      passed: 0,
      compileError: "Execution timed out — likely an infinite loop or exponential blow-up.",
    };
  }

  const idx = stdout.indexOf(MARKER);
  if (idx === -1) {
    return {
      ...base,
      results: [],
      passed: 0,
      compileError: stderr.trim() || "No results produced — the program failed before running the tests.",
    };
  }

  let raw: { index: number; value?: unknown; error?: string; ms?: number }[];
  try {
    raw = JSON.parse(stdout.slice(idx + MARKER.length));
  } catch {
    return { ...base, results: [], passed: 0, compileError: "Harness output was not valid JSON." };
  }

  const results: CaseResult[] = cases.map((c, i) => {
    const r = raw.find((x) => x.index === i);
    if (!r) return { index: i, passed: false, expected: c.expected, error: "no result" };
    if (r.error) return { index: i, passed: false, expected: c.expected, error: r.error };
    return {
      index: i,
      passed: valuesEqual(r.value, c.expected),
      expected: c.expected,
      actual: r.value,
      durationMs: r.ms ? Math.round(r.ms * 100) / 100 : undefined,
    };
  });

  return { ...base, results, passed: results.filter((r) => r.passed).length };
}
