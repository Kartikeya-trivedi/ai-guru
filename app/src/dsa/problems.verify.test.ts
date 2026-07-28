import { describe, it, expect } from "vitest";
import { PROBLEMS, type Problem } from "./problems";

/**
 * Regression tests for the problem bank's DATA, not its types.
 *
 * A wrong `expected` value is the worst defect this product can ship: the
 * candidate writes a correct solution, the runner reports it failing, and
 * nothing anywhere says the bank was at fault. Nothing else catches it —
 * tsc checks the shape, driver.integration.test.ts checks the runner, and
 * both pass happily with a mistyped answer sitting in the table.
 *
 * So every expected value is recomputed here from two independent directions:
 *
 *  1. A reference solution per problem — the intended optimal algorithm.
 *  2. A brute force for the subtle ones, written from the STATEMENT rather
 *     than from the fast algorithm. Agreement between an O(n) trick and an
 *     O(n^3) enumeration of the spec is real evidence; agreement between one
 *     implementation and itself is not.
 *
 * Deliberately pure in-repo computation: no network, no model calls, no
 * interpreters. This is the one verification that always runs, so it must
 * never be gated on a quota, a key, or an installed toolchain.
 */

interface TNode {
  val: number;
  left: TNode | null;
  right: TNode | null;
}

/**
 * The bank's level-order encoding. Must stay in step with `_build_tree` in
 * harness.ts — that one materialises the same arrays for the candidate, this
 * one materialises them for the reference solutions, and if they disagree
 * these tests would be verifying a tree the candidate never sees.
 */
function buildTree(vals: (number | null)[]): TNode | null {
  if (vals.length === 0 || vals[0] === null) return null;
  const root: TNode = { val: vals[0] as number, left: null, right: null };
  const queue: TNode[] = [root];
  let i = 1;
  while (queue.length > 0 && i < vals.length) {
    const node = queue.shift() as TNode;
    if (i < vals.length) {
      const lv = vals[i++];
      if (lv !== null) {
        node.left = { val: lv, left: null, right: null };
        queue.push(node.left);
      }
    }
    if (i < vals.length) {
      const rv = vals[i++];
      if (rv !== null) {
        node.right = { val: rv, left: null, right: null };
        queue.push(node.right);
      }
    }
  }
  return root;
}

type Solver = (...args: never[]) => unknown;

const reverse = (a: number[], i: number, j: number) => {
  while (i < j) {
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
    i++;
    j--;
  }
};

/** The intended optimal solution for every problem in the bank. */
const REFERENCE: Record<string, Solver> = {
  "conveyor-belt-rotation": ((belt: number[], k: number) => {
    const n = belt.length;
    if (n === 0) return belt;
    const s = k % n;
    reverse(belt, 0, n - 1);
    reverse(belt, 0, s - 1);
    reverse(belt, s, n - 1);
    return belt;
  }) as Solver,

  "telemetry-run-summary": ((readings: number[]) => {
    const out: number[][] = [];
    let i = 0;
    while (i < readings.length) {
      let j = i;
      while (j < readings.length && readings[j] === readings[i]) j++;
      out.push([readings[i], j - i]);
      i = j;
    }
    return out;
  }) as Solver,

  "pallet-spiral-scan": ((grid: number[][]) => {
    const out: number[] = [];
    if (grid.length === 0) return out;
    let top = 0,
      bottom = grid.length - 1,
      left = 0,
      right = grid[0].length - 1;
    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) out.push(grid[top][c]);
      top++;
      for (let r = top; r <= bottom; r++) out.push(grid[r][right]);
      right--;
      if (top <= bottom) {
        for (let c = right; c >= left; c--) out.push(grid[bottom][c]);
        bottom--;
      }
      if (left <= right) {
        for (let r = bottom; r >= top; r--) out.push(grid[r][left]);
        left++;
      }
    }
    return out;
  }) as Solver,

  "bay-contribution-factor": ((units: number[]) => {
    const n = units.length;
    const out = new Array<number>(n).fill(1);
    let pre = 1;
    for (let i = 0; i < n; i++) {
      out[i] = pre;
      pre *= units[i];
    }
    let suf = 1;
    for (let i = n - 1; i >= 0; i--) {
      out[i] *= suf;
      suf *= units[i];
    }
    return out;
  }) as Solver,

  "merge-maintenance-windows": ((windows: number[][]) => {
    if (windows.length === 0) return [];
    const s = windows.map((w) => [w[0], w[1]]).sort((a, b) => a[0] - b[0]);
    const out: number[][] = [s[0]];
    for (let i = 1; i < s.length; i++) {
      const last = out[out.length - 1];
      if (s[i][0] <= last[1]) last[1] = Math.max(last[1], s[i][1]);
      else out.push(s[i]);
    }
    return out;
  }) as Solver,

  "lowest-unassigned-rack": ((a: number[]) => {
    const n = a.length;
    for (let i = 0; i < n; i++) {
      while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] !== a[i]) {
        const t = a[a[i] - 1];
        a[a[i] - 1] = a[i];
        a[i] = t;
      }
    }
    for (let i = 0; i < n; i++) if (a[i] !== i + 1) return i + 1;
    return n + 1;
  }) as Solver,

  "duplicate-badge-scan": ((badges: number[], w: number) => {
    const last = new Map<number, number>();
    for (let i = 0; i < badges.length; i++) {
      const prev = last.get(badges[i]);
      if (prev !== undefined && i - prev <= w) return true;
      last.set(badges[i], i);
    }
    return false;
  }) as Solver,

  "scrambled-shelf-labels": ((a: string, b: string) => {
    if (a.length !== b.length) return false;
    const c = new Map<string, number>();
    for (const ch of a) c.set(ch, (c.get(ch) ?? 0) + 1);
    for (const ch of b) {
      const v = (c.get(ch) ?? 0) - 1;
      if (v < 0) return false;
      c.set(ch, v);
    }
    return true;
  }) as Solver,

  "route-code-groups": ((codes: string[]) => {
    // Insertion-ordered Map gives the required first-appearance grouping.
    const groups = new Map<string, string[]>();
    for (const code of codes) {
      const key = code.split("").sort().join("");
      const g = groups.get(key);
      if (g) g.push(code);
      else groups.set(key, [code]);
    }
    return [...groups.values()];
  }) as Solver,

  "longest-consecutive-rack-block": ((ids: number[]) => {
    const set = new Set(ids);
    let best = 0;
    for (const v of set) {
      if (set.has(v - 1)) continue;
      let len = 1;
      while (set.has(v + len)) len++;
      best = Math.max(best, len);
    }
    return best;
  }) as Solver,

  "crew-segments-exact-distinct": ((crew: number[], k: number) => {
    const atMost = (m: number): number => {
      if (m < 0) return 0;
      const count = new Map<number, number>();
      let left = 0,
        total = 0;
      for (let right = 0; right < crew.length; right++) {
        count.set(crew[right], (count.get(crew[right]) ?? 0) + 1);
        while (count.size > m) {
          const v = (count.get(crew[left]) as number) - 1;
          if (v === 0) count.delete(crew[left]);
          else count.set(crew[left], v);
          left++;
        }
        total += right - left + 1;
      }
      return total;
    };
    return atMost(k) - atMost(k - 1);
  }) as Solver,

  "mirrored-serial-check": ((serial: string) => {
    const ok = (ch: string) => /[a-z0-9]/i.test(ch);
    let l = 0,
      r = serial.length - 1;
    while (l < r) {
      while (l < r && !ok(serial[l])) l++;
      while (l < r && !ok(serial[r])) r--;
      if (l < r) {
        if (serial[l].toLowerCase() !== serial[r].toLowerCase()) return false;
        l++;
        r--;
      }
    }
    return true;
  }) as Solver,

  "sink-empty-bays": ((row: number[]) => {
    let w = 0;
    for (let i = 0; i < row.length; i++) if (row[i] !== 0) row[w++] = row[i];
    while (w < row.length) row[w++] = 0;
    return row;
  }) as Solver,

  "largest-banner-area": ((p: number[]) => {
    let l = 0,
      r = p.length - 1,
      best = 0;
    while (l < r) {
      best = Math.max(best, Math.min(p[l], p[r]) * (r - l));
      if (p[l] < p[r]) l++;
      else r--;
    }
    return best;
  }) as Solver,

  "zero-sum-drum-triples": ((charges: number[]) => {
    const a = [...charges].sort((x, y) => x - y);
    const out: number[][] = [];
    for (let i = 0; i < a.length - 2; i++) {
      if (i > 0 && a[i] === a[i - 1]) continue;
      let l = i + 1,
        r = a.length - 1;
      while (l < r) {
        const s = a[i] + a[l] + a[r];
        if (s === 0) {
          out.push([a[i], a[l], a[r]]);
          while (l < r && a[l] === a[l + 1]) l++;
          while (l < r && a[r] === a[r - 1]) r--;
          l++;
          r--;
        } else if (s < 0) l++;
        else r--;
      }
    }
    return out;
  }) as Solver,

  "coolant-pooling-profile": ((h: number[]) => {
    let l = 0,
      r = h.length - 1,
      lm = 0,
      rm = 0,
      total = 0;
    while (l < r) {
      if (h[l] < h[r]) {
        lm = Math.max(lm, h[l]);
        total += lm - h[l];
        l++;
      } else {
        rm = Math.max(rm, h[r]);
        total += rm - h[r];
        r--;
      }
    }
    return total;
  }) as Solver,

  "support-bot-deepest-path": ((vals: (number | null)[]) => {
    const go = (n: TNode | null): number => (n === null ? 0 : 1 + Math.max(go(n.left), go(n.right)));
    return go(buildTree(vals));
  }) as Solver,

  "symmetric-sensor-tree": ((vals: (number | null)[]) => {
    const mirror = (a: TNode | null, b: TNode | null): boolean => {
      if (a === null && b === null) return true;
      if (a === null || b === null) return false;
      return a.val === b.val && mirror(a.left, b.right) && mirror(a.right, b.left);
    };
    const root = buildTree(vals);
    return root === null ? true : mirror(root.left, root.right);
  }) as Solver,

  "validate-rack-index-tree": ((vals: (number | null)[]) => {
    const go = (n: TNode | null, lo: number, hi: number): boolean => {
      if (n === null) return true;
      if (n.val <= lo || n.val >= hi) return false;
      return go(n.left, lo, n.val) && go(n.right, n.val, hi);
    };
    return go(buildTree(vals), -Infinity, Infinity);
  }) as Solver,

  "nearest-shared-supervisor": ((vals: (number | null)[], a: number, b: number) => {
    const go = (n: TNode | null): TNode | null => {
      if (n === null || n.val === a || n.val === b) return n;
      const l = go(n.left);
      const r = go(n.right);
      if (l !== null && r !== null) return n;
      return l !== null ? l : r;
    };
    return (go(buildTree(vals)) as TNode).val;
  }) as Solver,

  "heaviest-cable-run": ((vals: (number | null)[]) => {
    const root = buildTree(vals);
    if (root === null) return 0;
    let best = -Infinity;
    const gain = (n: TNode | null): number => {
      if (n === null) return 0;
      const l = Math.max(0, gain(n.left));
      const r = Math.max(0, gain(n.right));
      best = Math.max(best, n.val + l + r);
      return n.val + Math.max(l, r);
    };
    gain(root);
    return best;
  }) as Solver,

  "reachable-relay-stations": ((n: number, links: number[][], start: number) => {
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of links) adj[a].push(b);
    const seen = new Array<boolean>(n).fill(false);
    const stack = [start];
    seen[start] = true;
    let count = 0;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      count++;
      for (const nx of adj[cur]) {
        if (!seen[nx]) {
          seen[nx] = true;
          stack.push(nx);
        }
      }
    }
    return count;
  }) as Solver,

  "contaminated-zone-count": ((tiles: number[][]) => {
    if (tiles.length === 0) return 0;
    const m = tiles.length,
      n = tiles[0].length;
    const seen = Array.from({ length: m }, () => new Array<boolean>(n).fill(false));
    let zones = 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (tiles[i][j] !== 1 || seen[i][j]) continue;
        zones++;
        const stack: number[][] = [[i, j]];
        seen[i][j] = true;
        while (stack.length > 0) {
          const [r, c] = stack.pop() as number[];
          for (const [dr, dc] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nr = r + dr,
              nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= m || nc >= n) continue;
            if (tiles[nr][nc] !== 1 || seen[nr][nc]) continue;
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
    }
    return zones;
  }) as Solver,

  "module-build-order": ((n: number, deps: number[][]) => {
    const adj: number[][] = Array.from({ length: n }, () => []);
    const indeg = new Array<number>(n).fill(0);
    for (const [a, b] of deps) {
      adj[a].push(b);
      indeg[b]++;
    }
    // Re-sorting a small ready list stands in for the min-heap the problem
    // intends; identical output, and the bank's n is tiny.
    const ready: number[] = [];
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
    const out: number[] = [];
    while (ready.length > 0) {
      ready.sort((x, y) => x - y);
      const cur = ready.shift() as number;
      out.push(cur);
      for (const nx of adj[cur]) if (--indeg[nx] === 0) ready.push(nx);
    }
    return out.length === n ? out : [];
  }) as Solver,

  "cheapest-route-hop-budget": ((
    n: number,
    lanes: number[][],
    src: number,
    dst: number,
    maxLanes: number,
  ) => {
    let dist = new Array<number>(n).fill(Infinity);
    dist[src] = 0;
    for (let round = 0; round < maxLanes; round++) {
      // Snapshot per round, or one shipment could take two lanes in a round
      // and quietly exceed the budget.
      const next = [...dist];
      for (const [a, b, c] of lanes) {
        if (dist[a] !== Infinity && dist[a] + c < next[b]) next[b] = dist[a] + c;
      }
      dist = next;
    }
    return dist[dst] === Infinity ? -1 : dist[dst];
  }) as Solver,

  "hoist-lift-sequences": ((levels: number) => {
    let a = 1,
      b = 1;
    for (let i = 0; i < levels; i++) {
      const t = a + b;
      a = b;
      b = t;
    }
    return a;
  }) as Solver,

  "best-trading-stretch": ((deltas: number[]) => {
    if (deltas.length === 0) return 0;
    let cur = deltas[0],
      best = deltas[0];
    for (let i = 1; i < deltas.length; i++) {
      cur = Math.max(deltas[i], cur + deltas[i]);
      best = Math.max(best, cur);
    }
    return best;
  }) as Solver,

  "minimum-crate-fill": ((sizes: number[], target: number) => {
    const dp = new Array<number>(target + 1).fill(Infinity);
    dp[0] = 0;
    for (let w = 1; w <= target; w++) {
      for (const s of sizes) {
        if (s <= w && dp[w - s] + 1 < dp[w]) dp[w] = dp[w - s] + 1;
      }
    }
    return dp[target] === Infinity ? -1 : dp[target];
  }) as Solver,

  "shared-firmware-changes": ((a: string, b: string) => {
    const m = a.length,
      n = b.length;
    let prev = new Array<number>(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      const cur = new Array<number>(n + 1).fill(0);
      for (let j = 1; j <= n; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      prev = cur;
    }
    return prev[n];
  }) as Solver,

  "log-route-rule-match": ((channel: string, rule: string) => {
    const m = channel.length,
      n = rule.length;
    let prev = new Array<boolean>(n + 1).fill(false);
    prev[0] = true;
    // A leading run of stars can match the empty channel; the first non-star
    // ends it for good.
    for (let j = 1; j <= n; j++) prev[j] = prev[j - 1] && rule[j - 1] === "*";
    for (let i = 1; i <= m; i++) {
      const cur = new Array<boolean>(n + 1).fill(false);
      for (let j = 1; j <= n; j++) {
        if (rule[j - 1] === "*") cur[j] = cur[j - 1] || prev[j];
        else if (rule[j - 1] === "?" || rule[j - 1] === channel[i - 1]) cur[j] = prev[j - 1];
      }
      prev = cur;
    }
    return prev[n];
  }) as Solver,
};

/**
 * Second opinions for the problems whose optimal algorithm is subtle enough
 * that I would not trust a single implementation of it. Each is written from
 * the statement — enumerate what the problem describes — so it shares no
 * reasoning with the reference above.
 */
const BRUTE_FORCE: Record<string, Solver> = {
  "bay-contribution-factor": ((units: number[]) =>
    units.map((_, i) => units.reduce((acc, v, j) => (i === j ? acc : acc * v), 1))) as Solver,

  "lowest-unassigned-rack": ((a: number[]) => {
    const set = new Set(a);
    let i = 1;
    while (set.has(i)) i++;
    return i;
  }) as Solver,

  "longest-consecutive-rack-block": ((ids: number[]) => {
    if (ids.length === 0) return 0;
    const s = [...new Set(ids)].sort((x, y) => x - y);
    let best = 1,
      run = 1;
    for (let i = 1; i < s.length; i++) {
      run = s[i] === s[i - 1] + 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return best;
  }) as Solver,

  "crew-segments-exact-distinct": ((crew: number[], k: number) => {
    let total = 0;
    for (let i = 0; i < crew.length; i++) {
      const seen = new Set<number>();
      for (let j = i; j < crew.length; j++) {
        seen.add(crew[j]);
        if (seen.size === k) total++;
      }
    }
    return total;
  }) as Solver,

  "largest-banner-area": ((p: number[]) => {
    let best = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) best = Math.max(best, Math.min(p[i], p[j]) * (j - i));
    return best;
  }) as Solver,

  "zero-sum-drum-triples": ((charges: number[]) => {
    const seen = new Set<string>();
    const out: number[][] = [];
    for (let i = 0; i < charges.length; i++)
      for (let j = i + 1; j < charges.length; j++)
        for (let k = j + 1; k < charges.length; k++) {
          if (charges[i] + charges[j] + charges[k] !== 0) continue;
          const t = [charges[i], charges[j], charges[k]].sort((x, y) => x - y);
          const key = t.join(",");
          if (!seen.has(key)) {
            seen.add(key);
            out.push(t);
          }
        }
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  }) as Solver,

  "coolant-pooling-profile": ((h: number[]) => {
    let total = 0;
    for (let i = 0; i < h.length; i++) {
      let l = 0,
        r = 0;
      for (let j = 0; j <= i; j++) l = Math.max(l, h[j]);
      for (let j = i; j < h.length; j++) r = Math.max(r, h[j]);
      total += Math.max(0, Math.min(l, r) - h[i]);
    }
    return total;
  }) as Solver,

  "heaviest-cable-run": ((vals: (number | null)[]) => {
    const root = buildTree(vals);
    if (root === null) return 0;
    const nodes: TNode[] = [];
    const collect = (n: TNode | null) => {
      if (n === null) return;
      nodes.push(n);
      collect(n.left);
      collect(n.right);
    };
    collect(root);
    // Every downward path from a node, then every join of two of them at a
    // peak — the statement's definition of a run, enumerated.
    const downs = (n: TNode | null): number[] => {
      if (n === null) return [];
      const out = [n.val];
      for (const c of [n.left, n.right]) for (const d of downs(c)) out.push(n.val + d);
      return out;
    };
    let best = -Infinity;
    for (const n of nodes) {
      const ls = [0, ...downs(n.left)];
      const rs = [0, ...downs(n.right)];
      for (const l of ls) for (const r of rs) best = Math.max(best, n.val + l + r);
    }
    return best;
  }) as Solver,

  "module-build-order": ((n: number, deps: number[][]) => {
    // Every permutation, keep the valid orders, take the smallest. Only
    // tractable because the bank's n is tiny — which is the point.
    const perms: number[][] = [];
    const go = (cur: number[], left: number[]) => {
      if (left.length === 0) {
        perms.push([...cur]);
        return;
      }
      for (let i = 0; i < left.length; i++)
        go([...cur, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    };
    go(
      [],
      Array.from({ length: n }, (_, i) => i),
    );
    const valid = perms.filter((p) => {
      const pos = new Map(p.map((v, i) => [v, i]));
      return deps.every(([a, b]) => (pos.get(a) as number) < (pos.get(b) as number));
    });
    if (valid.length === 0) return [];
    valid.sort((x, y) => {
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    });
    return valid[0];
  }) as Solver,

  "cheapest-route-hop-budget": ((
    _n: number, // depot count is unused: the walk only follows lanes that exist
    lanes: number[][],
    src: number,
    dst: number,
    maxLanes: number,
  ) => {
    // Exhaustive walk of (depot, lanesUsed). Terminates despite cycles
    // because the lane budget bounds the depth.
    let best = Infinity;
    const go = (at: number, used: number, cost: number) => {
      if (at === dst) best = Math.min(best, cost);
      if (used === maxLanes) return;
      for (const [a, b, c] of lanes) if (a === at) go(b, used + 1, cost + c);
    };
    go(src, 0, 0);
    return best === Infinity ? -1 : best;
  }) as Solver,

  "best-trading-stretch": ((deltas: number[]) => {
    if (deltas.length === 0) return 0;
    let best = -Infinity;
    for (let i = 0; i < deltas.length; i++) {
      let sum = 0;
      for (let j = i; j < deltas.length; j++) {
        sum += deltas[j];
        best = Math.max(best, sum);
      }
    }
    return best;
  }) as Solver,

  "minimum-crate-fill": ((sizes: number[], target: number) => {
    // BFS over reachable weights: the first touch of target is the fewest crates.
    if (target === 0) return 0;
    const seen = new Set<number>([0]);
    let frontier = [0];
    let depth = 0;
    while (frontier.length > 0) {
      depth++;
      const next: number[] = [];
      for (const w of frontier)
        for (const s of sizes) {
          const nw = w + s;
          if (nw === target) return depth;
          if (nw < target && !seen.has(nw)) {
            seen.add(nw);
            next.push(nw);
          }
        }
      frontier = next;
    }
    return -1;
  }) as Solver,

  "shared-firmware-changes": ((a: string, b: string) => {
    const memo = new Map<string, number>();
    const go = (i: number, j: number): number => {
      if (i === a.length || j === b.length) return 0;
      const key = `${i},${j}`;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const r = a[i] === b[j] ? 1 + go(i + 1, j + 1) : Math.max(go(i + 1, j), go(i, j + 1));
      memo.set(key, r);
      return r;
    };
    return go(0, 0);
  }) as Solver,

  "log-route-rule-match": ((channel: string, rule: string) => {
    // Plain backtracking straight off the statement: a star tries every split.
    const go = (i: number, j: number): boolean => {
      if (j === rule.length) return i === channel.length;
      if (rule[j] === "*") {
        for (let k = i; k <= channel.length; k++) if (go(k, j + 1)) return true;
        return false;
      }
      if (i === channel.length) return false;
      if (rule[j] === "?" || rule[j] === channel[i]) return go(i + 1, j + 1);
      return false;
    };
    return go(0, 0);
  }) as Solver,
};

/** Solvers mutate inputs (in-place problems), so hand each case a fresh copy. */
function check(solve: Solver, problem: Problem, kind: string) {
  for (const testCase of problem.testCases) {
    const args = JSON.parse(JSON.stringify(testCase.input)) as never[];
    expect(
      solve(...args),
      `${problem.id}: expected value for input ${JSON.stringify(testCase.input)} disagrees with the ${kind}`,
    ).toEqual(testCase.expected);
  }
}

const named = PROBLEMS.map((p) => [p.id, p] as const);

describe("problem bank composition", () => {
  it("holds exactly 30 problems with unique ids", () => {
    expect(PROBLEMS).toHaveLength(30);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(30);
  });

  it("covers each topic to the agreed weighting", () => {
    const count = (t: string) => PROBLEMS.filter((p) => p.topic === t).length;
    expect({
      "arrays-strings": count("arrays-strings"),
      hashing: count("hashing"),
      "two-pointers": count("two-pointers"),
      trees: count("trees"),
      graphs: count("graphs"),
      dp: count("dp"),
    }).toEqual({
      "arrays-strings": 6,
      hashing: 5,
      "two-pointers": 5,
      trees: 5,
      graphs: 4,
      dp: 5,
    });
  });

  it("holds the agreed difficulty mix", () => {
    const count = (d: string) => PROBLEMS.filter((p) => p.difficulty === d).length;
    expect({ easy: count("easy"), medium: count("medium"), hard: count("hard") }).toEqual({
      easy: 10,
      medium: 14,
      hard: 6,
    });
  });

  it("leaves no problem without a reference solution to check it against", () => {
    // Guards the bank against silently outgrowing this file: a 31st problem
    // added without a solver here would otherwise never be verified.
    expect(PROBLEMS.filter((p) => !REFERENCE[p.id]).map((p) => p.id)).toEqual([]);
    expect(Object.keys(BRUTE_FORCE).filter((id) => !PROBLEMS.some((p) => p.id === id))).toEqual([]);
  });
});

describe("each problem is well-formed", () => {
  it.each(named)("%s carries the fields the interview UI requires", (_id, problem) => {
    expect(problem.testCases.length).toBeGreaterThanOrEqual(6);
    expect(problem.testCases.filter((t) => t.sample === true)).toHaveLength(2);
    expect(problem.discussionAngles.length).toBeGreaterThanOrEqual(3);
    expect(problem.edgeCases.length).toBeGreaterThanOrEqual(2);
    expect(problem.statement).toContain("Example:");
    expect(Object.keys(problem.signatures).sort()).toEqual(["cpp", "java", "javascript", "python"]);
    for (const signature of Object.values(problem.signatures)) {
      expect(signature.length).toBeGreaterThan(0);
    }
  });
});

describe("every expected value survives recomputation", () => {
  it.each(named)("%s agrees with a reference solution", (id, problem) => {
    check(REFERENCE[id], problem, "reference solution");
  });

  it.each(named.filter(([id]) => BRUTE_FORCE[id]))(
    "%s agrees with an independent brute force",
    (id, problem) => {
      check(BRUTE_FORCE[id], problem, "brute force");
    },
  );
});
