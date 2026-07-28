import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDriver, treeArgPositions, parseOutcome } from "./harness";
import type { TestCase } from "./problems";

/**
 * Integration tests: the REAL driver, executed by REAL interpreters.
 *
 * Unit-testing the driver as a string proves nothing — the bug this guards
 * against (level-order arrays never materialised into TreeNodes) produced
 * perfectly valid-looking Python that failed every case at runtime. A correct
 * solution being reported as 0/n is the worst outcome this product has, so it
 * gets tested by actually running it.
 *
 * Skips cleanly if the interpreter isn't installed rather than failing CI on
 * a machine that simply lacks it.
 */

function have(exe: string, arg = "--version"): boolean {
  try {
    execFileSync(exe, [arg], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasPython = have("python");
const hasNode = have("node");

function execute(exe: string, filename: string, src: string, cases: TestCase[]) {
  const dir = mkdtempSync(join(tmpdir(), "drv-"));
  try {
    const f = join(dir, filename);
    writeFileSync(f, src, "utf8");
    const stdout = execFileSync(exe, [f], {
      input: JSON.stringify(cases.map((c) => ({ input: c.input }))),
      encoding: "utf8",
      timeout: 20000,
    });
    return parseOutcome(stdout, "", cases, {
      timedOut: false,
      runtimeMissing: false,
      exitCode: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TREE_SIG = "def deepestPath(root: Optional[TreeNode]) -> int:";

/** Level-order arrays with nulls, trailing nulls omitted — the bank's encoding. */
const TREE_CASES: TestCase[] = [
  { input: [[1, 2, 3, 4, 5]], expected: 3 },
  { input: [[]], expected: 0 },
  { input: [[1]], expected: 1 },
  { input: [[1, null, 2, null, 3]], expected: 3 },
  { input: [[1, 2, null, 3]], expected: 3 },
  { input: [[5, 4, 8, 11, null, 13, 4, 7, 2]], expected: 4 },
];

describe("treeArgPositions", () => {
  it("finds the tree argument from the annotated python signature", () => {
    expect(treeArgPositions(TREE_SIG)).toEqual([0]);
    expect(
      treeArgPositions("def nearestSharedSupervisor(root: Optional[TreeNode], a: int, b: int) -> int:"),
    ).toEqual([0]);
  });

  it("returns nothing for signatures with no tree", () => {
    expect(treeArgPositions("def merge(logs: List[int], k: int) -> int:")).toEqual([]);
    expect(treeArgPositions("def noArgs() -> int:")).toEqual([]);
  });
});

describe.skipIf(!hasPython)("python driver (real interpreter)", () => {
  it("materialises level-order arrays into TreeNodes", () => {
    // Written the way a candidate would: against the TreeNode the signature
    // promises, with zero knowledge of the array encoding.
    const solution = `def deepestPath(root: Optional[TreeNode]) -> int:
    if root is None:
        return 0
    return 1 + max(deepestPath(root.left), deepestPath(root.right))`;

    const src = buildDriver("python", "deepestPath", solution, { treeArgs: [0] });
    const out = execute("python", "s.py", src, TREE_CASES);
    expect(out.results.filter((r) => r.error)).toEqual([]);
    expect(out.passed).toBe(TREE_CASES.length);
  });

  it("supplies typing imports the signatures rely on", () => {
    // Optional/List appear in the bank's annotations; without the import the
    // candidate's own signature raises NameError before their code ever runs.
    const solution = `def total(nums: List[int], flag: Optional[int]) -> int:
    return sum(nums) + (flag or 0)`;
    const cases: TestCase[] = [{ input: [[1, 2], 3], expected: 6 }];
    const out = execute("python", "s.py", buildDriver("python", "total", solution), cases);
    expect(out.passed).toBe(1);
  });

  it("reports a per-case exception without voiding the run", () => {
    const solution = `def f(n: int) -> int:
    if n == 0:
        raise ValueError("boom")
    return n`;
    const cases: TestCase[] = [{ input: [1], expected: 1 }, { input: [0], expected: 0 }];
    const out = execute("python", "s.py", buildDriver("python", "f", solution), cases);
    expect(out.passed).toBe(1);
    expect(out.results[1].error).toContain("ValueError");
  });
});

describe.skipIf(!hasNode)("javascript driver (real interpreter)", () => {
  it("materialises level-order arrays into TreeNodes", () => {
    const solution = `function deepestPath(root) {
  if (!root) return 0;
  return 1 + Math.max(deepestPath(root.left), deepestPath(root.right));
}`;
    const src = buildDriver("javascript", "deepestPath", solution, { treeArgs: [0] });
    const out = execute("node", "s.mjs", src, TREE_CASES);
    expect(out.results.filter((r) => r.error)).toEqual([]);
    expect(out.passed).toBe(TREE_CASES.length);
  });

  it("passes non-tree arguments through untouched", () => {
    const solution = `function addAll(nums, k) { return nums.reduce((a, b) => a + b, 0) * k; }`;
    const cases: TestCase[] = [{ input: [[1, 2, 3], 2], expected: 12 }];
    const out = execute("node", "s.mjs", buildDriver("javascript", "addAll", solution), cases);
    expect(out.passed).toBe(1);
  });
});
