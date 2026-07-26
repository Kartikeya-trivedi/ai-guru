import { describe, it, expect } from "vitest";
import { valuesEqual, parseOutcome, buildDriver, canExecute } from "./harness";
import { functionNameFrom } from "./run";
import type { TestCase } from "./problems";

/**
 * Judging correctness is the highest-stakes logic in the DSA round: a false
 * negative tells a candidate their correct solution is wrong. These tests
 * are about that, not coverage.
 */

describe("valuesEqual", () => {
  it("compares primitives and arrays structurally", () => {
    expect(valuesEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(valuesEqual([1, 2], [2, 1])).toBe(false); // order matters
    expect(valuesEqual("a", "a")).toBe(true);
  });

  it("tolerates float representation error", () => {
    // 0.1 + 0.2 !== 0.3 must not fail a correct average/median solution.
    expect(valuesEqual(0.1 + 0.2, 0.3)).toBe(true);
  });

  it("does not conflate distinct numbers", () => {
    expect(valuesEqual(1, 1.0000001)).toBe(false);
  });

  it("compares objects irrespective of key order", () => {
    expect(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("does not treat null and undefined as equal to 0 or false", () => {
    expect(valuesEqual(null, 0)).toBe(false);
    expect(valuesEqual(undefined, null)).toBe(false);
    expect(valuesEqual(false, 0)).toBe(false);
  });
});

const cases: TestCase[] = [
  { input: [[1, 2]], expected: 3 },
  { input: [[]], expected: 0 },
];
const ok = { timedOut: false, runtimeMissing: false, exitCode: 0 };

describe("parseOutcome", () => {
  it("marks matching results as passed", () => {
    const out = parseOutcome(
      `___RESULTS___[{"index":0,"value":3,"ms":0.1},{"index":1,"value":0,"ms":0.1}]`,
      "",
      cases,
      ok,
    );
    expect(out.passed).toBe(2);
    expect(out.results.every((r) => r.passed)).toBe(true);
  });

  it("isolates a per-case exception instead of voiding the run", () => {
    // 1/2 passing must read as exactly that — it's the signal the AI judge
    // and the candidate both need.
    const out = parseOutcome(
      `___RESULTS___[{"index":0,"value":3},{"index":1,"error":"IndexError: list index out of range"}]`,
      "",
      cases,
      ok,
    );
    expect(out.passed).toBe(1);
    expect(out.results[1].error).toContain("IndexError");
  });

  it("explains a timeout rather than just reporting failure", () => {
    const out = parseOutcome("", "", cases, { ...ok, timedOut: true });
    expect(out.passed).toBe(0);
    expect(out.compileError).toMatch(/infinite loop|exponential/i);
  });

  it("surfaces a missing toolchain distinctly from a wrong answer", () => {
    const out = parseOutcome("", "toolchain not found", cases, {
      ...ok,
      runtimeMissing: true,
    });
    expect(out.runtimeMissing).toBe(true);
  });

  it("reports a crash before the harness ran as a build error", () => {
    const out = parseOutcome("", "SyntaxError: invalid syntax", cases, ok);
    expect(out.compileError).toContain("SyntaxError");
    expect(out.passed).toBe(0);
  });

  it("ignores stray stdout printed by the candidate's own code", () => {
    // Debug prints are normal under interview pressure; they must not break judging.
    const out = parseOutcome(
      `debugging here\n[1, 2]\n___RESULTS___[{"index":0,"value":3},{"index":1,"value":0}]`,
      "",
      cases,
      ok,
    );
    expect(out.passed).toBe(2);
  });
});

describe("functionNameFrom", () => {
  it("extracts names across language signature styles", () => {
    expect(functionNameFrom("def merge_windows(logs, k):")).toBe("merge_windows");
    expect(functionNameFrom("function mergeWindows(logs, k) {")).toBe("mergeWindows");
    expect(functionNameFrom("const mergeWindows = (logs, k) => {")).toBe("mergeWindows");
    expect(functionNameFrom("vector<int> mergeWindows(vector<int>& logs, int k)")).toBe("mergeWindows");
  });
});

describe("language gating", () => {
  it("only claims python and javascript are executable", () => {
    expect(canExecute("python")).toBe(true);
    expect(canExecute("javascript")).toBe(true);
    expect(canExecute("cpp")).toBe(false);
    expect(canExecute("java")).toBe(false);
  });

  it("refuses to build a driver for a non-executable language", () => {
    // Better a loud throw than silently producing a harness that fails
    // correct solutions.
    expect(() => buildDriver("cpp", "solve", "")).toThrow(/AI-judged/);
  });
});
