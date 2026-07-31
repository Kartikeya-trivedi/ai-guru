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

/**
 * Which argument positions are trees.
 *
 * The bank encodes tree inputs as level-order arrays, but signatures promise
 * a `TreeNode` — so the driver must materialise nodes before calling, or a
 * candidate's *correct* tree code throws on every case and gets reported as
 * 0/n. Positions are read from the Python signature because it is the only
 * one carrying type annotations; argument order is identical across the four
 * languages, so those indices apply to all of them.
 */
export function treeArgPositions(pythonSignature: string): number[] {
  const params = pythonSignature.match(/\(([^)]*)\)/)?.[1] ?? "";
  if (!params.trim()) return [];
  return params
    .split(",")
    .map((p, i) => (/\bTreeNode\b/.test(p) ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * Definitions the candidate's code may reference but shouldn't have to write:
 * the TreeNode type, and the typing imports the signatures use. Prepended, so
 * the solution can refer to them.
 */
function prelude(language: Language, needsTree: boolean): string {
  if (language === "python") {
    return `from typing import Optional, List, Dict, Tuple, Set
${needsTree ? `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _build_tree(_a):
    if not _a or _a[0] is None:
        return None
    _root = TreeNode(_a[0])
    _q = [_root]
    _i = 1
    _h = 0
    while _h < len(_q) and _i < len(_a):
        _n = _q[_h]
        _h += 1
        if _i < len(_a):
            _v = _a[_i]; _i += 1
            if _v is not None:
                _n.left = TreeNode(_v); _q.append(_n.left)
        if _i < len(_a):
            _v = _a[_i]; _i += 1
            if _v is not None:
                _n.right = TreeNode(_v); _q.append(_n.right)
    return _root
` : ""}`;
  }
  return needsTree
    ? `class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val; this.left = left; this.right = right;
  }
}
function _buildTree(a) {
  if (!a || a.length === 0 || a[0] === null) return null;
  const root = new TreeNode(a[0]);
  const q = [root];
  let i = 1, h = 0;
  while (h < q.length && i < a.length) {
    const n = q[h++];
    if (i < a.length) {
      const v = a[i++];
      if (v !== null) { n.left = new TreeNode(v); q.push(n.left); }
    }
    if (i < a.length) {
      const v = a[i++];
      if (v !== null) { n.right = new TreeNode(v); q.push(n.right); }
    }
  }
  return root;
}
`
    : "";
}

export function buildDriver(
  language: Language,
  fnName: string,
  source: string,
  opts: { treeArgs?: number[] } = {},
): string {
  if (!canExecute(language)) {
    throw new Error(
      `${language} solutions are AI-judged in V1 — no test-case execution yet. Guard with canExecute() before calling.`,
    );
  }
  const treeArgs = opts.treeArgs ?? [];
  const head = prelude(language, treeArgs.length > 0);

  switch (language) {
    case "python":
      return `${head}
${source}

# --- harness ---
import sys, json, time
_TREE_ARGS = ${JSON.stringify(treeArgs)}
_cases = json.loads(sys.stdin.read())
_out = []
for _i, _c in enumerate(_cases):
    _t0 = time.perf_counter()
    try:
        _args = [_build_tree(_v) if _p in _TREE_ARGS else _v for _p, _v in enumerate(_c["input"])]
        _r = ${fnName}(*_args)
        # Serialise per case with allow_nan=False. A single inf/NaN return (a
        # forgotten sentinel) otherwise makes json.dumps of the whole list emit
        # bare Infinity — invalid JSON that voids EVERY passing case, not just
        # the offending one.
        _out.append(json.dumps({"index": _i, "value": _r, "ms": (time.perf_counter() - _t0) * 1000}, allow_nan=False))
    except Exception as _e:
        _out.append(json.dumps({"index": _i, "error": f"{type(_e).__name__}: {_e}"}))
print("___RESULTS___[" + ",".join(_out) + "]")`;

    case "javascript":
      return `${head}
${source}

// --- harness ---
const _TREE_ARGS = ${JSON.stringify(treeArgs)};
// Throw on non-finite numbers (incl. nested) so a stray Infinity/NaN becomes
// that case's error rather than being silently coerced to null and mis-graded.
const _safe = (obj) =>
  JSON.stringify(obj, (_k, v) => {
    if (typeof v === "number" && !Number.isFinite(v)) throw new RangeError("non-finite result: " + v);
    return v;
  });
const _chunks = [];
process.stdin.on("data", (c) => _chunks.push(c));
process.stdin.on("end", () => {
  const cases = JSON.parse(Buffer.concat(_chunks).toString());
  const parts = cases.map((c, i) => {
    const t0 = performance.now();
    try {
      const args = c.input.map((v, p) => (_TREE_ARGS.includes(p) ? _buildTree(v) : v));
      return _safe({ index: i, value: ${fnName}(...args), ms: performance.now() - t0 });
    } catch (e) {
      return JSON.stringify({ index: i, error: String(e && e.message ? e.message : e) });
    }
  });
  process.stdout.write("___RESULTS___[" + parts.join(",") + "]");
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
