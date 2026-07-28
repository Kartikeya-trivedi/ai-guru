/**
 * DSA problem bank.
 *
 * Every problem here is written for this product. They exercise the standard
 * interview techniques — two pointers, hashing, BFS, DP — under scenarios,
 * prose, examples and tests authored here. No third-party problem text is
 * reproduced.
 *
 * Two conventions the types cannot express:
 *
 *  - `signatures` are declarations only. The runner supplies the surrounding
 *    scaffolding: imports, the TreeNode definition, and argument marshalling.
 *  - Tree inputs are encoded as level-order arrays with `null` for an absent
 *    child and trailing nulls omitted.
 *
 * The tree encoding is a REQUIREMENT ON THE RUNNER, not a description of it.
 * `buildDriver` honours it: `treeArgPositions` reads the argument positions
 * typed as TreeNode out of the Python signature (the only one carrying
 * annotations; arg order matches across languages) and the driver
 * materialises those arrays into nodes before calling. Without that, a
 * correct tree solution throws on every case and is reported 0/n — see
 * driver.integration.test.ts, which runs a real solution through real
 * interpreters to keep it that way.
 */

export type Difficulty = "easy" | "medium" | "hard";
export type Topic = "arrays-strings" | "hashing" | "two-pointers" | "trees" | "graphs" | "dp";

export interface TestCase {
  /** Arguments passed to the candidate's function, in order. */
  input: unknown[];
  expected: unknown;
  /** Shown to the candidate as a worked example (2 per problem max). */
  sample?: boolean;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: Topic;
  /** Problem statement in markdown. Original prose. */
  statement: string;
  /** Function signature per language the candidate implements. */
  signatures: Record<"python" | "javascript" | "cpp" | "java", string>;
  constraints: string[];
  testCases: TestCase[];
  /** What a senior interviewer probes BEFORE the candidate writes code —
   *  approach, complexity, edge cases. This is the product's differentiator. */
  discussionAngles: string[];
  /** The intended optimal complexity, e.g. "O(n) time, O(1) space". */
  optimalComplexity: string;
  /** Edge cases a strong candidate should raise unprompted. */
  edgeCases: string[];
}

export const PROBLEMS: Problem[] = [
  {
    id: "conveyor-belt-rotation",
    title: "Conveyor Belt Rotation",
    difficulty: "easy",
    topic: "arrays-strings",
    statement: `A parcel belt runs in a continuous loop. On every tick the motor advances the belt
by one slot: the parcel in the last slot wraps around to the front, and every other
parcel shifts up by one. Given the belt's current contents and a tick count k, report
the belt's contents after the motor has run for k ticks. The belt has been running
unattended overnight, so k may be far larger than the belt is long.

Example:

    belt = [1, 2, 3, 4, 5], k = 2    ->  [4, 5, 1, 2, 3]
    belt = [-3, 0, 5, -8, 2], k = 7  ->  [-8, 2, -3, 0, 5]`,
    signatures: {
      python: "def rotateBelt(belt: List[int], k: int) -> List[int]:",
      javascript: "function rotateBelt(belt, k)",
      cpp: "vector<int> rotateBelt(vector<int>& belt, int k)",
      java: "int[] rotateBelt(int[] belt, int k)",
    },
    constraints: [
      "0 <= belt.length <= 10^5",
      "-10^9 <= belt[i] <= 10^9",
      "0 <= k <= 10^9",
    ],
    testCases: [
      { input: [[1, 2, 3, 4, 5], 2], expected: [4, 5, 1, 2, 3], sample: true },
      { input: [[-3, 0, 5, -8, 2], 7], expected: [-8, 2, -3, 0, 5], sample: true },
      { input: [[10, 20, 30, 40], 0], expected: [10, 20, 30, 40] },
      { input: [[1, 2], 5], expected: [2, 1] },
      { input: [[7, 7, 7], 1], expected: [7, 7, 7] },
      { input: [[], 3], expected: [] },
      { input: [[9], 100], expected: [9] },
      { input: [[1, 2, 3, 4], 4], expected: [1, 2, 3, 4] },
    ],
    discussionAngles: [
      "Almost everyone reaches for a second array first. Accept it, then ask for O(1) extra space. Two roads lead there — three reversals, or cycle-walking with gcd — and both are fine. Make them justify why their cycle count is right if they pick the second.",
      "Push on k > n before they write anything. If they don't reduce k modulo n unprompted, ask what their loop does when k is 10^9 and the belt has 3 slots.",
      "Ask what `k % n` evaluates to on an empty belt. It's a division by zero in most languages. A candidate who guards the empty case before the modulo is thinking about the machine, not just the algorithm.",
      "If they propose 'rotate by one, k times', ask them to state the complexity out loud. O(n*k) usually gets caught the moment they say it.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Empty belt with k > 0 — the modulo by length must never be evaluated.",
      "k a multiple of the length, including k = 0: the belt is unchanged.",
      "Single-slot belt: unchanged for every k.",
      "k far larger than the belt length.",
    ],
  },
  {
    id: "telemetry-run-summary",
    title: "Telemetry Run Summary",
    difficulty: "easy",
    topic: "arrays-strings",
    statement: `A field device reports a status code once per second, and most of the time the code
doesn't change. To cut the uplink bill, the readings are collapsed into runs before
transmission: each maximal stretch of identical consecutive codes becomes a single
[code, length] pair. Given the raw readings in chronological order, return the run
summary. Only consecutive readings collapse — a code that reappears later starts a
fresh run.

Example:

    readings = [3, 3, 3, 1, 1, 4]  ->  [[3, 3], [1, 2], [4, 1]]
    readings = [1, 2, 3]           ->  [[1, 1], [2, 1], [3, 1]]`,
    signatures: {
      python: "def summarizeRuns(readings: List[int]) -> List[List[int]]:",
      javascript: "function summarizeRuns(readings)",
      cpp: "vector<vector<int>> summarizeRuns(vector<int>& readings)",
      java: "int[][] summarizeRuns(int[] readings)",
    },
    constraints: [
      "0 <= readings.length <= 10^5",
      "-10^9 <= readings[i] <= 10^9",
      "Runs are formed only from consecutive equal readings.",
    ],
    testCases: [
      { input: [[3, 3, 3, 1, 1, 4]], expected: [[3, 3], [1, 2], [4, 1]], sample: true },
      { input: [[1, 2, 3]], expected: [[1, 1], [2, 1], [3, 1]], sample: true },
      { input: [[5]], expected: [[5, 1]] },
      { input: [[]], expected: [] },
      { input: [[2, 2, 2, 2, 2, 2]], expected: [[2, 6]] },
      { input: [[0, 0, -1, -1, -1, 0]], expected: [[0, 2], [-1, 3], [0, 1]] },
      { input: [[7, 7, 8, 8, 7, 7]], expected: [[7, 2], [8, 2], [7, 2]] },
    ],
    discussionAngles: [
      "The whole problem is the boundary condition. Ask up front how they'll emit the final run — the loop that only writes on a change silently drops it. Candidates who spot this before coding are rare and worth noting.",
      "Ask whether a code reappearing later joins the earlier run. The spec says no, but candidates who ask rather than assume are showing the instinct you want on ambiguous tickets.",
      "Worth a quick probe: this is compression, so when does the output get *bigger* than the input? Alternating readings double the size. Ask what they'd do about that in a real uplink — a header bit, a fallback to raw.",
    ],
    optimalComplexity: "O(n) time, O(1) extra space beyond the output",
    edgeCases: [
      "Empty readings — return an empty summary, not [[0, 0]] or similar.",
      "A single reading, and a stream that is one long run: the final run must still be emitted.",
      "The same code returning after a gap forms a separate run.",
    ],
  },
  {
    id: "pallet-spiral-scan",
    title: "Pallet Spiral Scan",
    difficulty: "medium",
    topic: "arrays-strings",
    statement: `An inventory drone photographs a rectangular block of pallets. To keep its flight path
short it starts at the top-left pallet, flies right along the top row, then down the far
column, then left along the bottom row, then up the near column — and repeats, spiralling
inward over the pallets it hasn't visited yet, until every pallet has been photographed.
Given the grid of recorded pallet weights, return the weights in the order the drone
visits them. The grid is rectangular but not necessarily square.

Example:

    grid = [[1, 2, 3],
            [4, 5, 6],
            [7, 8, 9]]      ->  [1, 2, 3, 6, 9, 8, 7, 4, 5]

    grid = [[1, 2, 3, 4]]   ->  [1, 2, 3, 4]`,
    signatures: {
      python: "def spiralScan(grid: List[List[int]]) -> List[int]:",
      javascript: "function spiralScan(grid)",
      cpp: "vector<int> spiralScan(vector<vector<int>>& grid)",
      java: "int[] spiralScan(int[][] grid)",
    },
    constraints: [
      "0 <= grid.length <= 100",
      "All rows have the same length; 1 <= grid[i].length <= 100 when the grid is non-empty.",
      "-10^9 <= grid[i][j] <= 10^9",
    ],
    testCases: [
      {
        input: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]],
        expected: [1, 2, 3, 6, 9, 8, 7, 4, 5],
        sample: true,
      },
      { input: [[[1, 2, 3, 4]]], expected: [1, 2, 3, 4], sample: true },
      { input: [[[1, 2], [3, 4]]], expected: [1, 2, 4, 3] },
      { input: [[[1], [2], [3]]], expected: [1, 2, 3] },
      { input: [[]], expected: [] },
      { input: [[[5]]], expected: [5] },
      { input: [[[1, 2, 3], [4, 5, 6]]], expected: [1, 2, 3, 6, 5, 4] },
      { input: [[[1, 2], [3, 4], [5, 6], [7, 8]]], expected: [1, 2, 4, 6, 8, 7, 5, 3] },
    ],
    discussionAngles: [
      "Two designs show up: four shrinking boundaries, or a direction vector plus a visited set. Ask for the space cost of each — the visited grid is O(mn) and the boundary version is O(1). Then ask which they'd rather debug at 2am.",
      "The interesting bug is the last stripe. In a grid with one row left, the boundary version walks it right, then walks it back left and double-counts. Ask them to trace a 1x4 and a 3x1 by hand before they claim they're done — that's where the re-check on top <= bottom comes from.",
      "Ask what they'd do if the grid were ragged rather than rectangular. It's out of scope, but the answer tells you whether they validate inputs or trust them.",
    ],
    optimalComplexity: "O(m*n) time, O(1) extra space beyond the output",
    edgeCases: [
      "Empty grid — no rows at all.",
      "Single row and single column, where the inward turn must not re-emit the stripe.",
      "Non-square grids in both orientations (wide and tall).",
    ],
  },
  {
    id: "bay-contribution-factor",
    title: "Bay Contribution Factor",
    difficulty: "medium",
    topic: "arrays-strings",
    statement: `A warehouse audit scores every storage bay by its contribution factor: the product of
the unit counts in all the *other* bays. Given the unit counts in bay order, return each
bay's contribution factor. Auditors forbid division in the calculation — a single empty
bay would make the divide-the-total shortcut collapse, and they want the arithmetic to
be inspectable. A bay's factor when it is the only bay is 1, the empty product.

Example:

    units = [2, 3, 4, 5]  ->  [60, 40, 30, 24]
    units = [1, 0, 3]     ->  [0, 3, 0]`,
    signatures: {
      python: "def contributionFactors(units: List[int]) -> List[int]:",
      javascript: "function contributionFactors(units)",
      cpp: "vector<int> contributionFactors(vector<int>& units)",
      java: "int[] contributionFactors(int[] units)",
    },
    constraints: [
      "1 <= units.length <= 10^5",
      "-30 <= units[i] <= 30",
      "Every contribution factor is guaranteed to fit in a signed 32-bit integer.",
      "Division may not be used.",
    ],
    testCases: [
      { input: [[2, 3, 4, 5]], expected: [60, 40, 30, 24], sample: true },
      { input: [[1, 0, 3]], expected: [0, 3, 0], sample: true },
      { input: [[0, 0, 5]], expected: [0, 0, 0] },
      { input: [[7]], expected: [1] },
      { input: [[3, 4]], expected: [4, 3] },
      { input: [[-2, 3, -4]], expected: [-12, 8, -6] },
      { input: [[1, 1, 1, 1]], expected: [1, 1, 1, 1] },
      { input: [[5, 0]], expected: [0, 5] },
    ],
    discussionAngles: [
      "Ask why the auditors banned division before they design anything. The honest answer — a zero bay makes the shortcut undefined, and a candidate would then need to special-case one zero versus two zeros — is exactly the reasoning the prefix/suffix design avoids. Candidates who articulate that have understood the problem rather than memorised it.",
      "Get the two-pass prefix and suffix arrays, then push: can the suffix array go away? Folding it into a running scalar on the second pass is the O(1)-extra-space move. Ask them whether the output array counts against their space budget and let them argue it.",
      "Probe on the zeros anyway, since the tests do: what does their code return for [0, 0, 5]? Every factor is zero because every bay has at least one other empty bay. Candidates often hand-wave this.",
      "Negatives are in range. Ask if anything in their approach cares about sign — it shouldn't, and knowing why not is the point.",
    ],
    optimalComplexity: "O(n) time, O(1) extra space beyond the output",
    edgeCases: [
      "A single bay — the empty product is 1.",
      "Exactly one empty bay: every other bay's factor is 0, and the empty bay's is the product of the rest.",
      "Two or more empty bays: every factor is 0.",
      "Negative counts, where sign must carry through.",
    ],
  },
  {
    id: "merge-maintenance-windows",
    title: "Merge Maintenance Windows",
    difficulty: "medium",
    topic: "arrays-strings",
    statement: `Ops teams each book their own maintenance window as a [start, end] pair of minute
offsets. The status page shouldn't show four overlapping banners when the service is
really down once, so windows that overlap — or merely touch, since one ending exactly as
the next begins leaves the service continuously down — must be collapsed into a single
window. Given the booked windows in arbitrary order, return the merged windows sorted by
start time.

Example:

    windows = [[9, 12], [11, 14], [16, 18]]  ->  [[9, 14], [16, 18]]
    windows = [[5, 8], [8, 10]]              ->  [[5, 10]]`,
    signatures: {
      python: "def mergeWindows(windows: List[List[int]]) -> List[List[int]]:",
      javascript: "function mergeWindows(windows)",
      cpp: "vector<vector<int>> mergeWindows(vector<vector<int>>& windows)",
      java: "int[][] mergeWindows(int[][] windows)",
    },
    constraints: [
      "0 <= windows.length <= 10^4",
      "-10^9 <= start <= end <= 10^9",
      "Windows that touch at a single point merge.",
      "The result must be sorted by start time.",
    ],
    testCases: [
      { input: [[[9, 12], [11, 14], [16, 18]]], expected: [[9, 14], [16, 18]], sample: true },
      { input: [[[5, 8], [8, 10]]], expected: [[5, 10]], sample: true },
      { input: [[]], expected: [] },
      { input: [[[3, 7]]], expected: [[3, 7]] },
      { input: [[[10, 20], [1, 3]]], expected: [[1, 3], [10, 20]] },
      { input: [[[1, 10], [2, 4], [6, 8]]], expected: [[1, 10]] },
      { input: [[[4, 4], [4, 4]]], expected: [[4, 4]] },
      { input: [[[0, 2], [3, 5], [6, 8]]], expected: [[0, 2], [3, 5], [6, 8]] },
      { input: [[[-5, -1], [-2, 3]]], expected: [[-5, 3]] },
    ],
    discussionAngles: [
      "Sorting by start is the unlock. Don't hand it over — ask what property they'd want the input to have, and let them arrive at it. Then ask *why* sorting by start is enough: once sorted, any window that overlaps the running one must overlap at its start, so a single pass suffices.",
      "The touching rule is deliberately stated. Ask them where it lives in their code — it's the difference between `next.start <= current.end` and `<`. Then ask which one they'd have picked without being told, and how they'd have found out they were wrong.",
      "The containment case is the classic bug: merging [1,10] with [2,4] must keep the end at 10, not 4. Watch for a blind `current.end = next.end`. Ask them to trace [[1,10],[2,4],[6,8]].",
      "Ask for the complexity and make them separate the sort from the merge. O(n log n) dominated by the sort, O(n) for the pass — and if the input arrived pre-sorted, the whole thing is linear. Good candidates ask whether it's pre-sorted.",
    ],
    optimalComplexity: "O(n log n) time, O(n) space for the output (O(1) extra if sorted in place)",
    edgeCases: [
      "No windows booked at all.",
      "One window fully containing another — the end must not shrink.",
      "Windows touching at exactly one point, which merge.",
      "Zero-length windows like [4, 4], and negative offsets.",
    ],
  },
  {
    id: "lowest-unassigned-rack",
    title: "Lowest Unassigned Rack ID",
    difficulty: "hard",
    topic: "arrays-strings",
    statement: `Rack IDs are positive integers handed out from 1 upward. The assignment table has been
maintained by hand for years and has drifted: it contains duplicates, zeros, negative
tombstone markers, and IDs far outside any range ever issued. Given the table's current
contents, find the smallest positive integer that is not assigned to any rack. The table
is large and the audit runs on a constrained device, so the scan must be linear in time
and use only constant extra space. You may rearrange the table in place.

Example:

    assigned = [2, 1, 4]  ->  3
    assigned = [1, 2, 3]  ->  4`,
    signatures: {
      python: "def lowestUnassignedRack(assigned: List[int]) -> int:",
      javascript: "function lowestUnassignedRack(assigned)",
      cpp: "int lowestUnassignedRack(vector<int>& assigned)",
      java: "int lowestUnassignedRack(int[] assigned)",
    },
    constraints: [
      "0 <= assigned.length <= 10^5",
      "-2^31 <= assigned[i] <= 2^31 - 1",
      "O(n) time and O(1) extra space required.",
      "The input array may be modified.",
    ],
    testCases: [
      { input: [[2, 1, 4]], expected: 3, sample: true },
      { input: [[1, 2, 3]], expected: 4, sample: true },
      { input: [[]], expected: 1 },
      { input: [[-4, 0, -1]], expected: 1 },
      { input: [[7, 8, 9]], expected: 1 },
      { input: [[1, 1, 1]], expected: 2 },
      { input: [[3, 4, -1, 1]], expected: 2 },
      { input: [[1, 2, 0, 5, 3]], expected: 4 },
      { input: [[2147483647, 1]], expected: 2 },
    ],
    discussionAngles: [
      "The key insight is a counting argument, not a coding trick: with n entries, the answer is always in [1, n+1], because n slots cannot cover 1..n+1. Ask them to bound the answer before they touch the array. If they get that, the O(1) space constraint stops looking impossible — everything outside the window is noise.",
      "Expect a hash set first. It's correct and O(n) time, so don't reject it — name it as the baseline, then say memory is the constraint and see whether they realise the array itself can be the hash table, with value v living at index v-1.",
      "The placement loop is where candidates break. Ask what guarantees termination when they swap inside a while loop, and what happens on [1, 1] — swapping two equal values loops forever without the `already in place` guard. Make them state the amortised argument: every swap puts one value in its final home, so there are at most n swaps.",
      "Ask what their code does with 2147483647 as an entry. Using the value as an index needs the out-of-range filter *first*; candidates who negate or offset in place should be asked about overflow explicitly.",
    ],
    optimalComplexity: "O(n) time, O(1) extra space",
    edgeCases: [
      "Empty table — the answer is 1.",
      "All entries non-positive or all far out of range: the answer is 1.",
      "A complete run 1..n with no gap — the answer is n+1, one past the end.",
      "Duplicates, which must not cause an infinite swap loop.",
    ],
  },
  {
    id: "duplicate-badge-scan",
    title: "Duplicate Badge Within a Window",
    difficulty: "easy",
    topic: "hashing",
    statement: `A turnstile writes one badge ID to the security log per entry, in scan order. Tailgating
shows up as the same badge being scanned twice in quick succession — someone passing their
badge back over the barrier. Given the log and a window size w, report whether any badge
appears twice at positions no more than w scans apart. A badge reused far later in the day
is ordinary and does not count.

Example:

    badges = [4, 7, 4, 9], w = 2  ->  true   (badge 4 at positions 0 and 2)
    badges = [4, 7, 4, 9], w = 1  ->  false  (that reuse is 2 scans apart)`,
    signatures: {
      python: "def hasNearbyRescan(badges: List[int], w: int) -> bool:",
      javascript: "function hasNearbyRescan(badges, w)",
      cpp: "bool hasNearbyRescan(vector<int>& badges, int w)",
      java: "boolean hasNearbyRescan(int[] badges, int w)",
    },
    constraints: [
      "0 <= badges.length <= 10^5",
      "-10^9 <= badges[i] <= 10^9",
      "0 <= w <= 10^5",
      "Positions i < j count when badges[i] == badges[j] and j - i <= w.",
    ],
    testCases: [
      { input: [[4, 7, 4, 9], 2], expected: true, sample: true },
      { input: [[4, 7, 4, 9], 1], expected: false, sample: true },
      { input: [[1, 2, 3], 10], expected: false },
      { input: [[], 5], expected: false },
      { input: [[8], 0], expected: false },
      { input: [[5, 5], 1], expected: true },
      { input: [[5, 5], 0], expected: false },
      { input: [[1, 2, 1, 2, 1], 2], expected: true },
      { input: [[-3, 0, -3], 2], expected: true },
    ],
    discussionAngles: [
      "Two shapes both work: a map from badge to its last position, or a sliding set of the previous w badges. Ask for both and then for the space difference — O(n) versus O(min(n, w)). The map is easier to get right; the set is tighter. Let them pick and defend it.",
      "If they choose the map, ask why storing only the *last* position is safe. The argument is that a nearer duplicate always dominates a further one, so an older position can never rescue a match. Candidates who store a list of all positions per badge haven't seen this and are one step from O(n^2).",
      "The sliding set version has an eviction bug waiting: the element leaving the window is at index i - w, not i - w - 1 or i - w + 1. Ask them to trace [5, 5] with w = 1 and again with w = 0 — those two tests pin the off-by-one exactly.",
      "Ask what w = 0 means physically. No two distinct positions can be 0 apart, so the answer is always false — a candidate who reasons that out rather than testing it is reading the spec properly.",
    ],
    optimalComplexity: "O(n) time, O(min(n, w)) space",
    edgeCases: [
      "Empty log, or a single scan — no pair exists.",
      "w = 0, which can never produce a match.",
      "A duplicate exactly w apart (inclusive) versus w+1 apart (exclusive).",
      "Negative badge IDs, which must hash like any other value.",
    ],
  },
  {
    id: "scrambled-shelf-labels",
    title: "Scrambled Shelf Labels",
    difficulty: "easy",
    topic: "hashing",
    statement: `A label printer with a failing ribbon feed sometimes prints the right characters in the
wrong order. Before flagging a shelf as mislabelled, the audit tool checks the weaker
condition: are the two labels built from exactly the same characters, each used the same
number of times, differing only in arrangement? Given two labels, report whether one is a
rearrangement of the other. Both labels are lowercase ASCII letters.

Example:

    a = "crate",  b = "trace"   ->  true
    a = "pallet", b = "palate"  ->  false  (two l's versus two a's)`,
    signatures: {
      python: "def isScrambleOf(a: str, b: str) -> bool:",
      javascript: "function isScrambleOf(a, b)",
      cpp: "bool isScrambleOf(string a, string b)",
      java: "boolean isScrambleOf(String a, String b)",
    },
    constraints: [
      "0 <= a.length, b.length <= 10^5",
      "a and b contain lowercase ASCII letters only.",
      "Comparison is over character multisets, not order.",
    ],
    testCases: [
      { input: ["crate", "trace"], expected: true, sample: true },
      { input: ["pallet", "palate"], expected: false, sample: true },
      { input: ["", ""], expected: true },
      { input: ["a", ""], expected: false },
      { input: ["aabb", "bbaa"], expected: true },
      { input: ["aabb", "abbb"], expected: false },
      { input: ["xy", "xx"], expected: false },
      { input: ["decimal", "medical"], expected: true },
    ],
    discussionAngles: [
      "Sorting both and comparing is the obvious O(n log n). Take it, then ask what the alphabet size buys them — 26 lowercase letters means a fixed-size count array and a linear pass. Ask them to state the space honestly: O(1) only because the alphabet is bounded, and they should say so.",
      "The length check is a one-line early exit that most candidates skip. Ask what their counting loop does on 'a' versus '' if they forget it — the answer depends on whether they decrement in a second pass or compare two maps, and tracing it is more instructive than telling them.",
      "Push on the alphabet assumption: what changes for full Unicode? The count array becomes a hash map, space becomes O(k) in distinct characters, and — the part most candidates miss — combining characters mean 'same characters' needs normalisation first. You're probing whether they know the constraint is doing real work.",
      "'pallet' versus 'palate' is chosen so equal lengths and equal letter *sets* still disagree. Ask why a set-based solution fails here before they write one.",
    ],
    optimalComplexity: "O(n) time, O(1) space for a fixed 26-letter alphabet",
    edgeCases: [
      "Two empty labels — trivially rearrangements.",
      "Different lengths, which can exit immediately.",
      "Same letter set but different multiplicities, e.g. two l's versus two a's.",
    ],
  },
  {
    id: "route-code-groups",
    title: "Grouping Scrambled Route Codes",
    difficulty: "medium",
    topic: "hashing",
    statement: `A dispatch import mangled the route codes: each code's characters survived but their
order did not, so codes that were once identical now look different. Recover the grouping
by bucketing codes that are rearrangements of one another. Return the groups in order of
first appearance, and inside each group keep the codes in the order they appeared in the
input. Duplicate codes are real records and each one belongs in its group.

Example:

    codes = ["arc", "car", "bin", "rca", "nib"]
      ->  [["arc", "car", "rca"], ["bin", "nib"]]

    codes = ["x", "y", "z"]
      ->  [["x"], ["y"], ["z"]]`,
    signatures: {
      python: "def groupScrambledRoutes(codes: List[str]) -> List[List[str]]:",
      javascript: "function groupScrambledRoutes(codes)",
      cpp: "vector<vector<string>> groupScrambledRoutes(vector<string>& codes)",
      java: "List<List<String>> groupScrambledRoutes(String[] codes)",
    },
    constraints: [
      "0 <= codes.length <= 10^4",
      "0 <= codes[i].length <= 100",
      "codes[i] contains lowercase ASCII letters only.",
      "Groups are ordered by first appearance; within a group, input order is preserved.",
    ],
    testCases: [
      {
        input: [["arc", "car", "bin", "rca", "nib"]],
        expected: [["arc", "car", "rca"], ["bin", "nib"]],
        sample: true,
      },
      { input: [["x", "y", "z"]], expected: [["x"], ["y"], ["z"]], sample: true },
      { input: [["solo"]], expected: [["solo"]] },
      { input: [[]], expected: [] },
      { input: [["ab", "ba", "ab"]], expected: [["ab", "ba", "ab"]] },
      { input: [["", ""]], expected: [["", ""]] },
      { input: [["tab", "bat", "tabs"]], expected: [["tab", "bat"], ["tabs"]] },
      { input: [["aa", "aa", "aaa"]], expected: [["aa", "aa"], ["aaa"]] },
    ],
    discussionAngles: [
      "Everything hinges on choosing a canonical key. Sorted characters is the first answer and it's fine — L log L per code. Then ask for the 26-slot count vector as a key, which is O(L). Ask when that trade actually matters: long codes and a small alphabet. If codes are three characters, sorting wins on constant factors and a good candidate will say so rather than reflexively optimising.",
      "The ordering guarantee is the part that separates careful candidates. Ask how they'll produce groups in first-appearance order — an insertion-ordered map gives it free in Python and JS, but Java's HashMap does not and C++'s unordered_map does not. Ask what they'd use in their language. This is where 'it passed locally' bugs come from.",
      "Ask what the key is for the empty string. It's the empty key, and two empty codes group together — cheap to get right, easy to crash on if they index into the first character.",
      "Probe the complexity properly: O(total input characters), not O(n). Candidates who say O(n log n) haven't distinguished the number of codes from their lengths.",
    ],
    optimalComplexity: "O(total characters) time and space using a character-count key",
    edgeCases: [
      "No codes at all.",
      "Duplicate identical codes, which stay as separate records in one group.",
      "Empty-string codes grouping together.",
      "Same letters but different lengths, e.g. 'tab' versus 'tabs', which must not group.",
    ],
  },
  {
    id: "longest-consecutive-rack-block",
    title: "Longest Consecutive Rack Block",
    difficulty: "medium",
    topic: "hashing",
    statement: `A floor plan lists the rack IDs currently installed, in no particular order and with the
occasional duplicate from a double-entry. Facilities wants to know the longest block of
consecutive IDs that is fully installed, so they can find the biggest contiguous stretch of
floor. Return the length of that block. IDs may be negative — the numbering scheme crossed
zero when the east wing was added. Sorting the list would be too slow for the nightly job,
so aim for linear expected time.

Example:

    ids = [9, 4, 11, 10, 3, 12]  ->  4   (9, 10, 11, 12)
    ids = [5, 5, 5]              ->  1`,
    signatures: {
      python: "def longestConsecutiveBlock(ids: List[int]) -> int:",
      javascript: "function longestConsecutiveBlock(ids)",
      cpp: "int longestConsecutiveBlock(vector<int>& ids)",
      java: "int longestConsecutiveBlock(int[] ids)",
    },
    constraints: [
      "0 <= ids.length <= 10^5",
      "-10^9 <= ids[i] <= 10^9",
      "Duplicates count once.",
      "O(n) expected time is the target.",
    ],
    testCases: [
      { input: [[9, 4, 11, 10, 3, 12]], expected: 4, sample: true },
      { input: [[5, 5, 5]], expected: 1, sample: true },
      { input: [[7]], expected: 1 },
      { input: [[]], expected: 0 },
      { input: [[-2, -1, 0, 1]], expected: 4 },
      { input: [[50, 8, 3, 51, 2, 52]], expected: 3 },
      { input: [[1, 3, 5, 7]], expected: 1 },
      { input: [[2, 2, 3, 3, 4]], expected: 3 },
      { input: [[0, -1, 1, -2, 2]], expected: 5 },
    ],
    discussionAngles: [
      "Sorting gives O(n log n) in about five lines and is a perfectly good first answer — take it, then point at the 'linear expected' line in the spec. The set-based solution is the target, but make them explain why it isn't quadratic, because at a glance it looks it.",
      "That explanation is the whole interview. Only starting a walk at a *block start* — a value v where v-1 is absent — bounds the total work, because each value is walked at most once across all blocks. A candidate who writes the start check but can't justify the amortised bound has pattern-matched. Push until they say it.",
      "Duplicates: ask what the set does to them for free, and then ask what a sorting solution has to do explicitly (skip equal neighbours, without resetting the run length). It's a good way to show the set version isn't just faster, it's simpler.",
      "Ask about 'expected' versus 'worst case'. Hashing is O(n) expected; adversarial inputs degrade it. If they mention that unprompted, ask what they'd do about it — a sort-based fallback or a tree set at O(n log n) worst case.",
    ],
    optimalComplexity: "O(n) expected time, O(n) space",
    edgeCases: [
      "Empty plan — the answer is 0, not 1.",
      "All duplicates of one ID — a block of length 1.",
      "Blocks that cross zero, and fully negative blocks.",
      "No consecutive pair at all, where every block has length 1.",
    ],
  },
  {
    id: "crew-segments-exact-distinct",
    title: "Shift Segments With Exactly K Crew",
    difficulty: "hard",
    topic: "hashing",
    statement: `A shift log records which crew member was on the line during each consecutive slot of the
day. Scheduling wants to audit handover cost, which they measure by counting the contiguous
stretches of the day staffed by exactly k distinct crew members. Given the log and k, return
how many such stretches exist. Stretches are non-empty and are identified by their start and
end slots, so two stretches covering the same crew at different times both count.

Example:

    crew = [1, 2, 1, 3], k = 2  ->  4
    crew = [4, 4, 4], k = 1     ->  6`,
    signatures: {
      python: "def countCrewSegments(crew: List[int], k: int) -> int:",
      javascript: "function countCrewSegments(crew, k)",
      cpp: "int countCrewSegments(vector<int>& crew, int k)",
      java: "int countCrewSegments(int[] crew, int k)",
    },
    constraints: [
      "0 <= crew.length <= 2 * 10^4",
      "1 <= crew[i] <= 10^4",
      "1 <= k <= 10^4",
      "Stretches are non-empty and contiguous; two stretches with the same crew at different positions both count.",
    ],
    testCases: [
      { input: [[1, 2, 1, 3], 2], expected: 4, sample: true },
      { input: [[4, 4, 4], 1], expected: 6, sample: true },
      { input: [[4, 4, 4], 2], expected: 0 },
      { input: [[], 1], expected: 0 },
      { input: [[5], 1], expected: 1 },
      { input: [[1, 2, 3, 4], 3], expected: 2 },
      { input: [[2, 1, 2, 1, 2], 2], expected: 10 },
      { input: [[7, 7, 8, 8], 1], expected: 6 },
      { input: [[1, 2, 1, 2, 3], 3], expected: 3 },
      { input: [[9, 9], 5], expected: 0 },
    ],
    discussionAngles: [
      "Let them build the O(n^2) enumeration first — it's the honest baseline and it's what you'll diff the fast version against. Then ask the question that unlocks the problem: 'why is a sliding window hard here?' The answer is that 'exactly k' isn't monotonic — growing the window can overshoot k and you can't tell from the boundary alone whether to shrink. That realisation is the interview.",
      "The trick is atMost(k) - atMost(k-1), and it's worth making them derive rather than recall it. Ask what atMost(k) counts and why *that* is monotonic (shrinking a window never increases distinct count, so a two-pointer works). Then the subtraction: every window with at most k, minus every window with at most k-1, leaves exactly k.",
      "Inside atMost, ask why adding (right - left + 1) at each step is the right increment. It counts every window *ending* at right — a per-endpoint decomposition. Candidates who write it from memory often can't say what the term means, and that's the tell.",
      "Ask what happens when k exceeds the number of distinct crew. atMost(k) and atMost(k-1) both saturate at the total window count and the difference is 0 — the formula handles it with no special case, which is worth having them notice.",
    ],
    optimalComplexity: "O(n) time, O(k) space",
    edgeCases: [
      "Empty log, or k larger than the number of distinct crew — the answer is 0.",
      "A single slot with k = 1.",
      "All slots the same crew member, where every stretch has exactly 1 distinct.",
      "Heavily repeated crew, where naive distinct-counting per stretch degrades badly.",
    ],
  },
  {
    id: "mirrored-serial-check",
    title: "Mirrored Serial Check",
    difficulty: "easy",
    topic: "two-pointers",
    statement: `Serial numbers on refurbished units are printed with grouping separators — hyphens and
spaces — inserted wherever the printer felt like it, and in mixed case. A serial is called
mirrored if, once you ignore every character that isn't a letter or digit and fold case
away, it reads identically forwards and backwards. Mirrored serials are reserved for
factory test units and must be rejected from customer inventory. Given a serial, report
whether it is mirrored.

Example:

    serial = "AB-BA"  ->  true   ("abba")
    serial = "A1-2b"  ->  false  ("a12b")`,
    signatures: {
      python: "def isMirrored(serial: str) -> bool:",
      javascript: "function isMirrored(serial)",
      cpp: "bool isMirrored(string serial)",
      java: "boolean isMirrored(String serial)",
    },
    constraints: [
      "0 <= serial.length <= 10^5",
      "serial contains printable ASCII characters.",
      "Only letters and digits are considered; comparison is case-insensitive.",
      "A serial with no letters or digits counts as mirrored.",
    ],
    testCases: [
      { input: ["AB-BA"], expected: true, sample: true },
      { input: ["A1-2b"], expected: false, sample: true },
      { input: [""], expected: true },
      { input: ["-"], expected: true },
      { input: ["x"], expected: true },
      { input: ["Rot-or"], expected: true },
      { input: ["12 321"], expected: true },
      { input: ["ab"], expected: false },
      { input: ["Nurses run"], expected: true },
    ],
    discussionAngles: [
      "The one-liner is to strip, lowercase, and compare against the reverse. It's correct and readable — say so, then ask for the space cost. Building the cleaned copy is O(n) extra; two pointers walking inward over the original is O(1). Ask which they'd ship: for a serial number the clean version is probably right, and a candidate who defends readability over a constant-factor win is showing judgement, not weakness.",
      "If they go two-pointer, the skip loops are the bug farm. Ask what `while (!isAlnum(s[l])) l++` does on a string of all hyphens — it runs off the end unless the bound check is inside the skip loop, not just the outer one. Make them trace \"-\".",
      "Ask where case folding happens. Doing it per comparison is fine; doing it by mutating the string is not, and doing it with a locale-sensitive toLower is a real bug in Turkish. Worth one question to see if they know case is harder than it looks.",
      "Ask why the empty string is mirrored. It's a convention the spec pins down, and a candidate who asks rather than guesses is doing the right thing — this is exactly the sort of thing that would be underspecified in a real ticket.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Empty serial, or one made entirely of separators — both are mirrored.",
      "A single alphanumeric character.",
      "Mixed case that only matches after folding.",
      "Digits and letters mixed, where the fold must not touch digits.",
    ],
  },
  {
    id: "sink-empty-bays",
    title: "Sink the Empty Bays",
    difficulty: "easy",
    topic: "two-pointers",
    statement: `A shelf row is stored as a list of bay contents, where 0 marks an empty bay. The picking
robot works fastest when it can stop scanning as soon as it hits the first empty bay, so
the row is periodically compacted: every occupied bay slides toward the front, keeping the
order the bays were stocked in, and every empty bay ends up at the back. Rearrange the row
in place and return it. The relative order of the occupied bays must not change — pickers
rely on it for FIFO stock rotation.

Example:

    row = [0, 4, 0, 9, 2]  ->  [4, 9, 2, 0, 0]
    row = [1, 2, 3]        ->  [1, 2, 3]`,
    signatures: {
      python: "def sinkEmptyBays(row: List[int]) -> List[int]:",
      javascript: "function sinkEmptyBays(row)",
      cpp: "vector<int> sinkEmptyBays(vector<int>& row)",
      java: "int[] sinkEmptyBays(int[] row)",
    },
    constraints: [
      "0 <= row.length <= 10^5",
      "-10^9 <= row[i] <= 10^9",
      "0 marks an empty bay.",
      "Must be done in place; the relative order of non-zero bays is preserved.",
    ],
    testCases: [
      { input: [[0, 4, 0, 9, 2]], expected: [4, 9, 2, 0, 0], sample: true },
      { input: [[1, 2, 3]], expected: [1, 2, 3], sample: true },
      { input: [[0, 0, 0]], expected: [0, 0, 0] },
      { input: [[]], expected: [] },
      { input: [[0]], expected: [0] },
      { input: [[5, 0]], expected: [5, 0] },
      { input: [[0, 5]], expected: [5, 0] },
      { input: [[-1, 0, -2, 0, 3]], expected: [-1, -2, 3, 0, 0] },
    ],
    discussionAngles: [
      "The write-pointer solution — copy every non-zero forward, then fill the tail with zeros — is the clean answer. Ask for the invariant before they code: everything left of `write` is compacted, everything between `write` and `read` is known-zero. Candidates who can state that write the loop correctly on the first try.",
      "There's a one-pass swap variant that avoids the tail fill. Ask them to compare it against the two-pass version on *writes*, not reads: swapping touches memory even when the element is already in place. On a row with no empties the two-pass version does zero writes and the naive swap version does n. That's a real difference and a nice one to make them find.",
      "Order preservation is the constraint doing the work. Ask what breaks if they use the obvious 'swap from both ends' trick — it's O(n) and in-place but it scrambles FIFO order. Naming a faster wrong answer and rejecting it for a stated reason is exactly the signal you want.",
      "Ask about negatives. 0 is the sentinel, not 'falsy' — a candidate writing JavaScript who tests `if (row[i])` has just deleted nothing, but a candidate testing truthiness on a value that could be 0 in other contexts is one refactor from a bug. Worth a moment.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Empty row, or a row of all empties.",
      "A row with no empties, which should ideally do no writes.",
      "A single bay, empty or occupied.",
      "Negative contents, which are occupied bays and must not be treated as empty.",
    ],
  },
  {
    id: "largest-banner-area",
    title: "Largest Banner Between Two Posts",
    difficulty: "medium",
    topic: "two-pointers",
    statement: `A trade-show booth has a row of support posts of varying heights, spaced one metre apart.
A rectangular banner is hung between any two posts, tied at the same height on both. Because
it must not overhang either post, the banner's height is the height of the shorter of the
two, and its width is the distance between them. Given the post heights in order, return the
largest banner area achievable. Posts between the two chosen ones do not obstruct the banner.

Example:

    posts = [1, 4, 2, 5]  ->  8   (posts at index 1 and 3: min(4, 5) * 2)
    posts = [3, 3]        ->  3   (min(3, 3) * 1)`,
    signatures: {
      python: "def largestBannerArea(posts: List[int]) -> int:",
      javascript: "function largestBannerArea(posts)",
      cpp: "int largestBannerArea(vector<int>& posts)",
      java: "int largestBannerArea(int[] posts)",
    },
    constraints: [
      "0 <= posts.length <= 10^5",
      "0 <= posts[i] <= 10^4",
      "Posts are spaced one metre apart, so width is the index difference.",
      "Fewer than two posts means no banner can be hung; return 0.",
    ],
    testCases: [
      { input: [[1, 4, 2, 5]], expected: 8, sample: true },
      { input: [[3, 3]], expected: 3, sample: true },
      { input: [[]], expected: 0 },
      { input: [[7]], expected: 0 },
      { input: [[0, 0, 0]], expected: 0 },
      { input: [[6, 1, 1, 1, 6]], expected: 24 },
      { input: [[2, 1, 5, 4]], expected: 6 },
      { input: [[1, 2, 3, 4, 5]], expected: 6 },
    ],
    discussionAngles: [
      "Brute force is every pair, O(n^2), and it's the right starting point. The two-pointer solution is a five-line function whose *correctness argument* is the entire interview — do not let them hand you the code without it.",
      "Drive the argument: start with the widest pair. Whichever post is shorter is the binding constraint, and every remaining pair involving that post is narrower and no taller — so its area cannot beat what you just measured, and the post can be discarded. Ask them to explain why moving the *taller* pointer instead would be wrong. That question separates the candidates who derived it from the ones who memorised it.",
      "Ask what happens on ties — when both posts are the same height, which pointer moves? Either, and it's worth asking them to prove that discarding one is safe: the discarded post can only pair with something no taller and narrower.",
      "The 'posts in between don't obstruct' line is deliberate. Ask what changes if they *do* obstruct — it becomes a different problem entirely, closer to trapped-volume reasoning. A candidate who notices the spec is protecting them from that is reading carefully.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Fewer than two posts — no banner, area 0.",
      "All posts of height 0.",
      "Two tall posts far apart beating adjacent taller pairs.",
      "Ties in height, where either pointer may move.",
    ],
  },
  {
    id: "zero-sum-drum-triples",
    title: "Three Drums That Cancel Out",
    difficulty: "medium",
    topic: "two-pointers",
    statement: `A test rig measures the residual charge on a batch of drums; readings may be positive,
negative, or zero. To calibrate the rig, technicians need every set of three drums whose
charges sum to exactly zero. Return each such triple with its charges in ascending order,
and return the list of triples sorted ascending — by first charge, then second. Two triples
using the same three charge values are the same calibration set even if they come from
different drums, so report each distinct value-triple once.

Example:

    charges = [-2, 0, 1, 1, 2]  ->  [[-2, 0, 2], [-2, 1, 1]]
    charges = [0, 0, 0, 0]      ->  [[0, 0, 0]]`,
    signatures: {
      python: "def zeroSumTriples(charges: List[int]) -> List[List[int]]:",
      javascript: "function zeroSumTriples(charges)",
      cpp: "vector<vector<int>> zeroSumTriples(vector<int>& charges)",
      java: "List<List<Integer>> zeroSumTriples(int[] charges)",
    },
    constraints: [
      "0 <= charges.length <= 3000",
      "-10^5 <= charges[i] <= 10^5",
      "Each triple is returned in ascending order; the list of triples is sorted ascending.",
      "Distinct by value-triple, not by drum index.",
    ],
    testCases: [
      { input: [[-2, 0, 1, 1, 2]], expected: [[-2, 0, 2], [-2, 1, 1]], sample: true },
      { input: [[0, 0, 0, 0]], expected: [[0, 0, 0]], sample: true },
      { input: [[]], expected: [] },
      { input: [[1, 2]], expected: [] },
      { input: [[1, 2, 3]], expected: [] },
      { input: [[-1, -1, 2, 2, 0, 1]], expected: [[-1, -1, 2], [-1, 0, 1]] },
      {
        input: [[-4, -2, -1, 0, 1, 2, 3]],
        expected: [[-4, 1, 3], [-2, -1, 3], [-2, 0, 2], [-1, 0, 1]],
      },
      { input: [[5, 5, 5]], expected: [] },
      { input: [[0, 0, 0]], expected: [[0, 0, 0]] },
      { input: [[-3, 3, 0, 0]], expected: [[-3, 0, 3]] },
    ],
    discussionAngles: [
      "Sorting first is the move, and it buys two separate things — ask them to name both. It makes the inner two-pointer scan possible, *and* it makes duplicate suppression a local check against the previous element instead of a global set of triples. Candidates usually see the first and not the second.",
      "Deduplication is where this problem is won or lost. Ask how they avoid emitting the same value-triple twice *before* they code. If the answer is 'a hash set of the triples', that's O(n^2) memory in the worst case and it works — accept it, then ask for the skip-equal-neighbours version and make them place the skips correctly: after the outer pick, and after recording a hit on both inner pointers. Three skip sites, and missing any one is a wrong answer, not a slow one.",
      "Ask why the triple can't just be found with a hash map per pair — it can, but then dedup and ordering get harder and space goes to O(n). The two-pointer version is O(1) extra beyond output. Making them compare is more useful than making them recite.",
      "[0,0,0,0] is a deliberate test. Ask what their skip logic does when every element is equal — over-skipping drops the one valid triple, under-skipping emits it four times.",
    ],
    optimalComplexity: "O(n^2) time, O(1) extra space beyond the output (after sorting in place)",
    edgeCases: [
      "Fewer than three readings — no triple exists.",
      "All zeros, where exactly one triple must be reported despite many index combinations.",
      "Repeated values forming a valid triple, e.g. [-2, 1, 1], which must not be skipped as a duplicate.",
      "No triple summing to zero at all.",
    ],
  },
  {
    id: "coolant-pooling-profile",
    title: "Coolant Pooling on a Rack Profile",
    difficulty: "hard",
    topic: "two-pointers",
    statement: `A row of server racks is described by a height profile: one non-negative integer per
column, each column one unit wide. A coolant line ruptures above the row and floods it.
Coolant settles into the dips and is held in place by taller columns on both sides; any
coolant not enclosed on both sides runs off the ends of the row and is lost. Once the row
has drained, return the total number of units of coolant still pooled on it.

Example:

    heights = [0, 2, 0, 3, 1, 2]  ->  3
    heights = [4, 1, 3]           ->  2`,
    signatures: {
      python: "def pooledUnits(heights: List[int]) -> int:",
      javascript: "function pooledUnits(heights)",
      cpp: "int pooledUnits(vector<int>& heights)",
      java: "int pooledUnits(int[] heights)",
    },
    constraints: [
      "0 <= heights.length <= 2 * 10^4",
      "0 <= heights[i] <= 10^5",
      "Each column is one unit wide.",
      "Coolant not enclosed on both sides runs off the ends.",
    ],
    testCases: [
      { input: [[0, 2, 0, 3, 1, 2]], expected: 3, sample: true },
      { input: [[4, 1, 3]], expected: 2, sample: true },
      { input: [[]], expected: 0 },
      { input: [[5]], expected: 0 },
      { input: [[3, 3]], expected: 0 },
      { input: [[1, 2, 3, 4]], expected: 0 },
      { input: [[4, 3, 2, 1]], expected: 0 },
      { input: [[5, 0, 5]], expected: 5 },
      { input: [[2, 0, 2, 0, 2]], expected: 4 },
      { input: [[0, 0, 0]], expected: 0 },
    ],
    discussionAngles: [
      "Make them state the per-column rule before any code: column i holds min(tallest to its left, tallest to its right) - heights[i], floored at zero. Every correct solution is a different way of computing those two maxima, and a candidate who starts from this rule can derive all of them. One who starts from 'I remember there are two pointers' cannot.",
      "The progression is the interview: O(n^2) rescanning both sides per column, then O(n) time and O(n) space with prefix and suffix max arrays, then O(1) space with two pointers. Walk them up it and make them justify each step's saving.",
      "The two-pointer step needs a real argument, so demand it. When leftMax < rightMax, the left column's fate is already decided — whatever is out to the right, there is *something* at least as tall as rightMax, so leftMax is the binding side and you can settle that column now without knowing the rest of the profile. Ask them to explain why it's safe to commit without having seen the whole array. That's the question.",
      "Ask about the monotonic-stack solution as a contrast: it computes the same total by horizontal layers instead of vertical columns. You're not looking for them to code it — you're checking whether they can hold two decompositions of the same quantity in their head.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Empty profile, a single column, or two columns — nothing can be enclosed.",
      "Strictly increasing or strictly decreasing profiles, which pool nothing.",
      "A flat profile, which pools nothing.",
      "Multiple separate basins in one row.",
    ],
  },
  {
    id: "support-bot-deepest-path",
    title: "Deepest Path Through a Support Bot",
    difficulty: "easy",
    topic: "trees",
    statement: `A support bot walks the customer through a binary decision tree: every node asks one
question, and the two children are the yes and no branches. A conversation ends at a leaf,
where the bot either resolves the issue or escalates. Product wants the worst-case number
of questions a customer can be asked, which is the number of nodes on the longest path from
the root down to any leaf. Given the tree, return that number. An empty tree means the bot
is unconfigured and asks nothing.

Example:

    tree = [5, 3, 8, null, null, 6, null]  ->  3   (5 -> 8 -> 6)
    tree = [1]                             ->  1`,
    signatures: {
      python: "def deepestPath(root: Optional[TreeNode]) -> int:",
      javascript: "function deepestPath(root)",
      cpp: "int deepestPath(TreeNode* root)",
      java: "int deepestPath(TreeNode root)",
    },
    constraints: [
      "0 <= number of nodes <= 10^4",
      "-10^9 <= node value <= 10^9",
      "An empty tree returns 0.",
      "Depth counts nodes, not edges.",
    ],
    testCases: [
      { input: [[5, 3, 8, null, null, 6, null]], expected: 3, sample: true },
      { input: [[1]], expected: 1, sample: true },
      { input: [[]], expected: 0 },
      { input: [[1, 2, null, 3, null, 4]], expected: 4 },
      { input: [[9, null, 8, null, 7]], expected: 3 },
      { input: [[2, 1, 3]], expected: 2 },
      { input: [[1, 2, 3, 4, 5, null, null, 6]], expected: 4 },
      { input: [[-1, -2, -3]], expected: 2 },
    ],
    discussionAngles: [
      "The three-line recursion is the answer and most candidates produce it instantly. That's not the interview — the interview is the follow-up. Ask for the space complexity and refuse 'O(1)': the call stack is O(h), and on a degenerate tree h is n. Ask what tree shape breaks their code with 10^4 nodes and whether their language tail-calls (it doesn't).",
      "Ask them to convert it to an iterative BFS by levels, and to say which they'd ship. BFS is O(w) space in the widest level, DFS is O(h). Neither dominates — a bushy tree favours DFS, a spindly one favours BFS. A candidate who says 'iterative is always better' hasn't thought about it.",
      "Nail down 'nodes, not edges'. It's the single most common off-by-one in tree problems, and the empty-tree and single-node tests pin both conventions. Ask which convention they'd assume if the spec were silent, and — better — whether they'd ask.",
      "Cheap probe worth its time: does anything in their solution depend on the node *values*? It shouldn't. Candidates who wrote a value comparison in a pure-structure problem have pattern-matched to BST habits.",
    ],
    optimalComplexity: "O(n) time, O(h) space",
    edgeCases: [
      "Empty tree — 0, and the recursion must not dereference null.",
      "Single node — 1, pinning the nodes-versus-edges convention.",
      "A fully one-sided chain, where recursion depth equals the node count.",
      "Unbalanced trees where the deeper side is not the first one visited.",
    ],
  },
  {
    id: "symmetric-sensor-tree",
    title: "Symmetric Sensor Tree",
    difficulty: "easy",
    topic: "trees",
    statement: `A sensor array is wired as a binary tree, and the manufacturing spec requires it to be
built symmetrically: the left half must be a mirror image of the right half, in both shape
and sensor ID. Mirror means reflected through the root — the left child's left subtree
mirrors the right child's right subtree, and so on down. A quality gate on the line needs to
reject any array that isn't symmetric. Given the tree, report whether it satisfies the spec.

Example:

    tree = [4, 2, 2, 1, 3, 3, 1]        ->  true
    tree = [4, 2, 2, null, 1, null, 1]  ->  false`,
    signatures: {
      python: "def isMirrorTree(root: Optional[TreeNode]) -> bool:",
      javascript: "function isMirrorTree(root)",
      cpp: "bool isMirrorTree(TreeNode* root)",
      java: "boolean isMirrorTree(TreeNode root)",
    },
    constraints: [
      "0 <= number of nodes <= 10^4",
      "-10^9 <= node value <= 10^9",
      "An empty tree is symmetric.",
      "Both structure and values must mirror.",
    ],
    testCases: [
      { input: [[4, 2, 2, 1, 3, 3, 1]], expected: true, sample: true },
      { input: [[4, 2, 2, null, 1, null, 1]], expected: false, sample: true },
      { input: [[]], expected: true },
      { input: [[7]], expected: true },
      { input: [[1, 2, null]], expected: false },
      { input: [[5, 6, 6]], expected: true },
      { input: [[5, 6, 7]], expected: false },
      { input: [[1, 2, 2, 3, null, null, 3]], expected: true },
    ],
    discussionAngles: [
      "The trap is baked into the problem. Ask them to write it, and watch for a single-argument recursion on one node — symmetry is a relation between *two* subtrees, so the helper needs two parameters. Candidates who try to force it into `isSymmetric(node)` get stuck in a way that's very informative to watch.",
      "Once they have the two-argument helper, make them say the recursive step out loud: mirror(a, b) requires a.val == b.val, mirror(a.left, b.right), and mirror(a.right, b.left). The crossing of left against right is the whole idea. Ask what a straight left-left / right-right comparison would test instead — that's tree *equality*, a different question.",
      "Ask about the null cases before they code: both null is true, exactly one null is false. The second test case is precisely this — same values, same depth, mirrored *structure* is what fails. If they only compare values they'll pass the first test and fail the second.",
      "Push for the iterative version using a queue that enqueues pairs. Then ask whether serialising each subtree and comparing strings would work — it can, but it's O(n) space and has subtle bugs around null markers. Comparing approaches beats grinding on one.",
    ],
    optimalComplexity: "O(n) time, O(h) space",
    edgeCases: [
      "Empty tree and single node — both symmetric.",
      "One child present, the other missing — asymmetric regardless of values.",
      "Mirrored structure but mismatched values, and matching values with mismatched structure.",
    ],
  },
  {
    id: "validate-rack-index-tree",
    title: "Validate a Sorted Rack Index",
    difficulty: "medium",
    topic: "trees",
    statement: `Rack lookups are served from a binary index tree that is supposed to maintain strict
search-tree ordering: every ID stored anywhere in a node's left subtree is strictly less
than that node's ID, and every ID anywhere in its right subtree is strictly greater. A
migration script has been rewriting the index in place and the on-call engineer no longer
trusts it, because lookups have started missing racks that are definitely present. Given the
tree, report whether it is a valid index. Duplicate IDs violate the ordering.

Example:

    tree = [8, 4, 12, 2, 6, 10, 14]     ->  true
    tree = [5, 1, 7, null, null, 4, 9]  ->  false  (4 sits right of 5 but is smaller)`,
    signatures: {
      python: "def isValidIndexTree(root: Optional[TreeNode]) -> bool:",
      javascript: "function isValidIndexTree(root)",
      cpp: "bool isValidIndexTree(TreeNode* root)",
      java: "boolean isValidIndexTree(TreeNode root)",
    },
    constraints: [
      "0 <= number of nodes <= 10^4",
      "-2^31 <= node value <= 2^31 - 1",
      "Ordering is strict; equal values are invalid.",
      "An empty tree is a valid index.",
    ],
    testCases: [
      { input: [[8, 4, 12, 2, 6, 10, 14]], expected: true, sample: true },
      { input: [[5, 1, 7, null, null, 4, 9]], expected: false, sample: true },
      { input: [[]], expected: true },
      { input: [[3]], expected: true },
      { input: [[2, 2]], expected: false },
      { input: [[2, null, 2]], expected: false },
      { input: [[10, 5, 15, null, null, 6, 20]], expected: false },
      { input: [[20, 10, 30, 5, 15, 25, 35]], expected: true },
      { input: [[1, null, 2, null, 3]], expected: true },
      { input: [[-5, -10, 0]], expected: true },
    ],
    discussionAngles: [
      "This problem exists to catch one specific wrong answer, so give it room to appear: checking only that each node sits correctly between its immediate children. It's local, it looks right, and it passes the first sample. The second sample is built to break it — 4 is a valid left child of 7, but it's in 5's right subtree. Let them write the local version, then hand them that case and watch them find it themselves.",
      "The fix is that each node inherits an open interval from its ancestors, narrowed on the way down. Ask them where the bound comes from and why it isn't the parent's value alone. Then ask about the root's initial bounds — 'infinity' is easy in Python, and in C++ or Java the LONG_MIN/LONG_MAX widening or an Optional/nullable bound is the honest answer. The [2147483647-adjacent] values in the constraints make this real, not academic.",
      "The in-order alternative is worth pulling out: a valid index yields a strictly increasing traversal, so track the previous value and compare. Ask which they prefer and why. In-order is O(h) space with a running scalar; bounds-passing is the same but fails faster. Both are fine — the reasoning is what you're grading.",
      "Strictness is stated, so ask what breaks with duplicates. [2, 2] and [2, null, 2] are both invalid, and a candidate using <= on one side and < on the other will pass exactly one of them.",
    ],
    optimalComplexity: "O(n) time, O(h) space",
    edgeCases: [
      "Empty tree and single node — both valid.",
      "A value that is valid against its parent but violates a distant ancestor's bound.",
      "Duplicates on either side, both invalid under strict ordering.",
      "Values at the extremes of the integer range, where sentinel bounds can overflow.",
    ],
  },
  {
    id: "nearest-shared-supervisor",
    title: "Nearest Shared Supervisor",
    difficulty: "medium",
    topic: "trees",
    statement: `A small org is modelled as a binary tree of people, each node holding a unique employee
number and its children being that person's direct reports. HR needs to route an escalation
between two employees to the nearest person who oversees them both — the deepest node whose
subtree contains both of them. A person counts as being in their own subtree, so if one
employee already reports up through the other, the answer is that other employee. Both
employees are guaranteed present. Return the employee number of the nearest shared supervisor.

Example:

    tree = [1, 2, 3, 4, 5, 6, 7], a = 4, b = 5  ->  2
    tree = [1, 2, 3, 4, 5, 6, 7], a = 4, b = 7  ->  1`,
    signatures: {
      python: "def nearestSharedSupervisor(root: Optional[TreeNode], a: int, b: int) -> int:",
      javascript: "function nearestSharedSupervisor(root, a, b)",
      cpp: "int nearestSharedSupervisor(TreeNode* root, int a, int b)",
      java: "int nearestSharedSupervisor(TreeNode root, int a, int b)",
    },
    constraints: [
      "1 <= number of nodes <= 10^4",
      "Employee numbers are unique.",
      "Both a and b are present in the tree; a may equal b.",
      "A node counts as its own descendant.",
      "The tree is not ordered — it is not a search tree.",
    ],
    testCases: [
      { input: [[1, 2, 3, 4, 5, 6, 7], 4, 5], expected: 2, sample: true },
      { input: [[1, 2, 3, 4, 5, 6, 7], 4, 7], expected: 1, sample: true },
      { input: [[1, 2, 3, 4, 5, 6, 7], 2, 4], expected: 2 },
      { input: [[9], 9, 9], expected: 9 },
      { input: [[1, 2, 3], 2, 3], expected: 1 },
      { input: [[1, 2, null, 3, null, 4], 3, 4], expected: 3 },
      { input: [[5, 3, 8, 1, 4, null, 9], 1, 4], expected: 3 },
      { input: [[5, 3, 8, 1, 4, null, 9], 1, 9], expected: 5 },
      { input: [[5, 3, 8, 1, 4, null, 9], 8, 9], expected: 8 },
    ],
    discussionAngles: [
      "State early that this is *not* a search tree, then watch whether they use the values to decide which way to descend anyway. It's a strong habit from BST problems and it produces confidently wrong code here.",
      "The elegant solution returns a node from each subtree and reads the result: two non-null returns means the split happens here, so this node is the answer; one non-null means both targets are down that side, so pass it up. Ask what the function is actually returning at each step — candidates who say 'the answer' are wrong. It returns 'the shallowest of {a, b, or the answer} found in this subtree', and that conflation is exactly why the code is short. Make them articulate it.",
      "The ancestor case is the one that trips people: when a is itself b's supervisor, the recursion returns a as soon as it finds it and never explores below. Ask why that's correct rather than a missed case. Then ask what would change if the targets weren't guaranteed present — the same code would return a non-null answer for a single found target and silently lie. That's a real production bug and a good place to end.",
      "If they propose the parent-pointer or root-to-node-path approach instead, take it — it's O(n) time and O(h) space too. Then ask which is easier to extend to k employees rather than two.",
    ],
    optimalComplexity: "O(n) time, O(h) space",
    edgeCases: [
      "a equals b — the answer is that employee.",
      "One employee is an ancestor of the other, where the answer is the ancestor itself.",
      "A degenerate one-sided chain, where recursion depth equals the node count.",
      "The two employees in different subtrees of the root, making the root the answer.",
    ],
  },
  {
    id: "heaviest-cable-run",
    title: "Heaviest Cable Run",
    difficulty: "hard",
    topic: "trees",
    statement: `A signal distribution network is laid out as a binary tree of junction boxes, and each box
applies a gain to the signal passing through it. Cheap boxes are lossy, so a gain may be
negative. A cable run is any path through the network that never visits a box twice: it walks
up from some box toward a common peak and back down to another, and it may be a single box.
The run's total gain is the sum of the gains of the boxes it passes through. Return the
highest total gain of any cable run. A run must contain at least one box; an empty network
has a total gain of 0.

Example:

    tree = [2, 5, 1]                       ->  8   (5 -> 2 -> 1)
    tree = [-4, 9, -6, null, null, 7, 3]   ->  9   (the single box 9)`,
    signatures: {
      python: "def heaviestRun(root: Optional[TreeNode]) -> int:",
      javascript: "function heaviestRun(root)",
      cpp: "int heaviestRun(TreeNode* root)",
      java: "int heaviestRun(TreeNode root)",
    },
    constraints: [
      "0 <= number of nodes <= 3 * 10^4",
      "-1000 <= node gain <= 1000",
      "A run visits each box at most once and turns at most once, at its highest box.",
      "An empty network returns 0.",
    ],
    testCases: [
      { input: [[2, 5, 1]], expected: 8, sample: true },
      { input: [[-4, 9, -6, null, null, 7, 3]], expected: 9, sample: true },
      { input: [[]], expected: 0 },
      { input: [[-3]], expected: -3 },
      { input: [[-1, -2, -3]], expected: -1 },
      { input: [[0, -5, -5]], expected: 0 },
      { input: [[1, 2, 3]], expected: 6 },
      { input: [[4, 11, null, 7, 2]], expected: 22 },
      { input: [[5, 4, 8, 11, null, 13, 4, 7, 2]], expected: 48 },
      { input: [[100, -200, -200, 50, 50, 50, 50]], expected: 100 },
    ],
    discussionAngles: [
      "The whole problem is that two different quantities live at every node, and candidates who don't separate them write code that looks right and is wrong. One is the best run *passing through* this node, which may use both children and is a candidate for the global answer. The other is the best run *starting* at this node and going down one side only, which is what the parent can extend. Make them name both before coding — if they try to return one value that serves both purposes, they will fail on negatives.",
      "The negative-gain handling is the second half. Ask what `max(0, childGain)` means physically: declining to extend into a lossy subtree, i.e. ending the run here. Then ask why the *answer* can still be negative even though the child contributions are floored at zero — because a run must contain a box, so an all-negative tree returns its least-bad single box. [-1, -2, -3] is exactly this and it's where clamped-to-zero solutions wrongly return 0.",
      "Ask where the global maximum gets recorded. It's a side effect during the recursion, not the return value — that asymmetry is genuinely unusual and worth making them say aloud. Candidates who return the answer up the tree have merged the two quantities again.",
      "Ask them to justify O(n): every box is visited once and does O(1) work. If they suggest recomputing subtree sums per node, get them to price it — that's O(n^2), or worse if they recompute per pair.",
    ],
    optimalComplexity: "O(n) time, O(h) space",
    edgeCases: [
      "Empty network returns 0, but an all-negative network must return its least-negative single box, not 0.",
      "A single box, including a negative one.",
      "The best run not passing through the root at all.",
      "Lossy boxes that should be excluded, where the run stops rather than extends.",
    ],
  },
  {
    id: "reachable-relay-stations",
    title: "Reachable Relay Stations",
    difficulty: "easy",
    topic: "graphs",
    statement: `A mesh of n relay stations is numbered 0 to n-1. Each link is one-way: a link [a, b] means
a can transmit to b, but not the reverse unless a separate link says so. Before a broadcast,
the operator needs to know the size of the audience: how many stations can receive a message
originating at a given station, counting the origin itself. The mesh has grown organically,
so it may contain loops back on itself and duplicate links between the same pair.

Example:

    n = 4, links = [[0, 1], [1, 2], [3, 0]], start = 0  ->  3   (0, 1, 2)
    n = 4, links = [[0, 1], [1, 2], [3, 0]], start = 3  ->  4   (3, 0, 1, 2)`,
    signatures: {
      python: "def countReachable(n: int, links: List[List[int]], start: int) -> int:",
      javascript: "function countReachable(n, links, start)",
      cpp: "int countReachable(int n, vector<vector<int>>& links, int start)",
      java: "int countReachable(int n, int[][] links, int start)",
    },
    constraints: [
      "1 <= n <= 10^5",
      "0 <= links.length <= 2 * 10^5",
      "Links are directed; self-links and duplicate links may appear.",
      "0 <= start < n; the origin counts toward the total.",
    ],
    testCases: [
      { input: [4, [[0, 1], [1, 2], [3, 0]], 0], expected: 3, sample: true },
      { input: [4, [[0, 1], [1, 2], [3, 0]], 3], expected: 4, sample: true },
      { input: [1, [], 0], expected: 1 },
      { input: [3, [], 1], expected: 1 },
      { input: [3, [[0, 1], [1, 0]], 0], expected: 2 },
      { input: [5, [[0, 1], [1, 2], [2, 3], [3, 4]], 2], expected: 3 },
      { input: [3, [[0, 0]], 0], expected: 1 },
      { input: [4, [[0, 1], [0, 1], [1, 2]], 0], expected: 3 },
      { input: [2, [[1, 0]], 0], expected: 1 },
    ],
    discussionAngles: [
      "Before any traversal, ask what they'd build first. An edge list is useless for walking — the adjacency list is a required preprocessing step, and candidates who start the BFS against the raw links are about to write an O(n*e) scan. Ask them to price both.",
      "BFS or DFS both work and the answer is identical, so don't let them agonise. Instead ask what differs: recursive DFS is O(n) stack on a 10^5 chain and will blow up, which makes this a real choice at these constraints, not a stylistic one.",
      "The loops in the spec are there to test the visited set. Ask what happens without it — infinite loop on [[0,1],[1,0]]. Then the sharper question: do they mark visited on enqueue or on dequeue? Marking on dequeue lets a node be queued many times, which is still correct but blows up the queue on dense graphs. Most candidates have never thought about this.",
      "Ask why direction matters: from 0 the answer is 3, from 3 it's 4, on the same mesh. Then ask what they'd change to make links bidirectional — it's one line, and knowing exactly which line is the point.",
    ],
    optimalComplexity: "O(n + e) time, O(n + e) space",
    edgeCases: [
      "A station with no outgoing links — the answer is 1, itself.",
      "Self-links and duplicate links, which must not double-count or loop.",
      "Cycles reaching back to the origin.",
      "Links pointing at the origin from elsewhere, which do not make anything reachable.",
    ],
  },
  {
    id: "contaminated-zone-count",
    title: "Counting Contaminated Zones",
    difficulty: "medium",
    topic: "graphs",
    statement: `A cleanroom floor is surveyed on a grid, marking each tile 1 for contaminated and 0 for
clean. Contaminated tiles that touch edge-to-edge form a single zone that can be sealed and
treated as one job; tiles touching only at a corner are separate zones, because the seal
tape cannot turn a corner. Given the survey grid, return how many distinct zones must be
treated.

Example:

    tiles = [[1, 1, 0],
             [0, 1, 0],
             [0, 0, 1]]   ->  2

    tiles = [[0, 0],
             [0, 0]]      ->  0`,
    signatures: {
      python: "def countZones(tiles: List[List[int]]) -> int:",
      javascript: "function countZones(tiles)",
      cpp: "int countZones(vector<vector<int>>& tiles)",
      java: "int countZones(int[][] tiles)",
    },
    constraints: [
      "0 <= tiles.length <= 300",
      "All rows have the same length; 1 <= tiles[i].length <= 300 when the grid is non-empty.",
      "tiles[i][j] is 0 or 1.",
      "Adjacency is edge-to-edge only — diagonals do not connect.",
    ],
    testCases: [
      { input: [[[1, 1, 0], [0, 1, 0], [0, 0, 1]]], expected: 2, sample: true },
      { input: [[[0, 0], [0, 0]]], expected: 0, sample: true },
      { input: [[]], expected: 0 },
      { input: [[[1]]], expected: 1 },
      { input: [[[1, 0, 1, 0, 1]]], expected: 3 },
      { input: [[[1, 1], [1, 1]]], expected: 1 },
      { input: [[[1, 0], [0, 1]]], expected: 2 },
      { input: [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]], expected: 1 },
      { input: [[[1, 0, 0], [0, 0, 0], [0, 0, 1]]], expected: 2 },
    ],
    discussionAngles: [
      "Make sure they see the shape of it: the grid is a graph in disguise, each tile a node and each shared edge an arc, and the answer is the number of connected components among the 1s. Candidates who name that reduction unprompted have transferred a concept; candidates who invent an ad-hoc scanning rule usually produce something subtly wrong.",
      "The structure is a loop over every tile that starts a flood only from an unvisited 1, incrementing the count once per flood. Ask why the count goes up in the outer loop and not inside the flood — that's the whole algorithm in one question, and getting it backwards counts every tile as its own zone.",
      "Ask whether they'll mutate the grid to mark visited or carry a separate visited array. Mutating is O(1) extra space and is what most people reach for; then ask whether they'd be comfortable destroying the caller's input. That trade — space against surprising the caller — is a real engineering conversation, and 'I'd document it' or 'I'd copy it' are both good answers.",
      "Push on the stack depth: recursive DFS on a 300x300 grid of all 1s recurses 90,000 deep and dies. Ask what they'd do — explicit stack or BFS queue. This is a case where the theoretical and practical answers genuinely diverge, and the constraint makes it bite.",
      "Ask what changes for diagonal adjacency. It's the direction list, one line — but the ring test would then still be 1 and [[1,0],[0,1]] would become 1 instead of 2. Good check that they know where the rule lives.",
    ],
    optimalComplexity: "O(m*n) time, O(m*n) space in the worst case",
    edgeCases: [
      "Empty grid, or a grid with no contamination — 0 zones.",
      "The entire grid contaminated, forming one zone and a worst-case traversal depth.",
      "Tiles touching only diagonally, which are separate zones.",
      "A single row or single column grid.",
    ],
  },
  {
    id: "module-build-order",
    title: "Deterministic Module Build Order",
    difficulty: "medium",
    topic: "graphs",
    statement: `A build system compiles n modules numbered 0 to n-1. A dependency [a, b] means module a
must be built before module b. The team wants reproducible builds, so when several modules
are ready to build at the same moment the tie is broken by always taking the lowest-numbered
one — which makes the output the lexicographically smallest valid order. Return that order,
or an empty list if the dependencies are contradictory and no order exists.

Example:

    n = 4, deps = [[0, 1], [0, 2], [1, 3], [2, 3]]  ->  [0, 1, 2, 3]
    n = 2, deps = [[0, 1], [1, 0]]                  ->  []   (contradictory)`,
    signatures: {
      python: "def buildOrder(n: int, deps: List[List[int]]) -> List[int]:",
      javascript: "function buildOrder(n, deps)",
      cpp: "vector<int> buildOrder(int n, vector<vector<int>>& deps)",
      java: "int[] buildOrder(int n, int[][] deps)",
    },
    constraints: [
      "0 <= n <= 10^5",
      "0 <= deps.length <= 2 * 10^5",
      "No duplicate dependency pairs.",
      "Ties among ready modules are broken by lowest module number.",
      "Return an empty list when no valid order exists.",
    ],
    testCases: [
      { input: [4, [[0, 1], [0, 2], [1, 3], [2, 3]]], expected: [0, 1, 2, 3], sample: true },
      { input: [2, [[0, 1], [1, 0]]], expected: [], sample: true },
      { input: [3, []], expected: [0, 1, 2] },
      { input: [1, []], expected: [0] },
      { input: [0, []], expected: [] },
      { input: [3, [[2, 0], [2, 1]]], expected: [2, 0, 1] },
      { input: [4, [[1, 0], [2, 0], [3, 1]]], expected: [2, 3, 1, 0] },
      { input: [3, [[0, 1], [1, 2], [2, 1]]], expected: [] },
      { input: [5, [[0, 2], [1, 2], [2, 3], [2, 4]]], expected: [0, 1, 2, 3, 4] },
      { input: [4, [[3, 2], [2, 1], [1, 0]]], expected: [3, 2, 1, 0] },
    ],
    discussionAngles: [
      "The tie-break rule is the interesting constraint and it's worth dwelling on. Plain Kahn's with a queue gives *a* valid order; this spec wants a specific one, which forces a min-heap instead of a FIFO. Ask them what data structure the ready set needs and why — and then ask what it costs: O((n + e) log n) instead of O(n + e). Ask whether reproducible builds are worth a log factor. There's a real answer (yes) and you want to hear them weigh it.",
      "Ask them to prove the greedy is actually lexicographically smallest, not just valid. The argument is an exchange: at each step, any module in the ready set could legally go next, so taking the smallest is safe — nothing you build later can make a smaller module available *now* that isn't already ready. Candidates often assert this; make them say why.",
      "Cycle detection should fall out rather than be bolted on. Ask how they know a cycle exists — the count of emitted modules falls short of n, because everything in a cycle keeps a non-zero in-degree forever. A candidate who adds a separate DFS colouring pass has doubled the work for nothing.",
      "Point at n = 0 returning [] and ask how a caller distinguishes 'nothing to build' from 'contradictory'. They can't, from the return value alone. It's a genuine API smell in the spec — a candidate who flags it and proposes null, an exception, or a result type is doing design review, which is exactly what you want at senior level.",
      "Ask which direction their adjacency list points and what in-degree means. Getting deps [a, b] backwards produces a perfectly plausible reversed order that passes the no-dependency tests.",
    ],
    optimalComplexity: "O((n + e) log n) time with a min-heap, O(n + e) space",
    edgeCases: [
      "No modules at all, or no dependencies, where the order is simply 0..n-1.",
      "A cycle, including one not reachable from the lowest-numbered module.",
      "Several modules ready simultaneously, where the tie-break decides the output.",
      "Dependencies that make the natural order run backwards, e.g. 3 before 2 before 1 before 0.",
    ],
  },
  {
    id: "cheapest-route-hop-budget",
    title: "Cheapest Route Within a Hop Budget",
    difficulty: "hard",
    topic: "graphs",
    statement: `A freight network connects n depots numbered 0 to n-1 by one-way lanes, each lane [a, b, c]
carrying goods from depot a to depot b at cost c. Every time freight transfers between lanes
it is rehandled, and the contract caps rehandling: a shipment may traverse at most maxLanes
lanes in total. Given the network, an origin, a destination, and the lane cap, return the
cheapest total cost of a route from origin to destination using no more than maxLanes lanes,
or -1 if no such route exists. Parallel lanes between the same pair of depots may exist.

Example:

    n = 4, lanes = [[0,1,10], [1,2,10], [0,2,50], [2,3,10]], src = 0, dst = 3, maxLanes = 2
      ->  60   (0 -> 2 -> 3; the cheaper 3-lane route is over budget)

    n = 4, lanes = [[0,1,10], [1,2,10], [0,2,50], [2,3,10]], src = 0, dst = 3, maxLanes = 3
      ->  30   (0 -> 1 -> 2 -> 3)`,
    signatures: {
      python:
        "def cheapestRoute(n: int, lanes: List[List[int]], src: int, dst: int, maxLanes: int) -> int:",
      javascript: "function cheapestRoute(n, lanes, src, dst, maxLanes)",
      cpp:
        "int cheapestRoute(int n, vector<vector<int>>& lanes, int src, int dst, int maxLanes)",
      java: "int cheapestRoute(int n, int[][] lanes, int src, int dst, int maxLanes)",
    },
    constraints: [
      "1 <= n <= 100",
      "0 <= lanes.length <= n * (n - 1)",
      "0 <= cost <= 10^4",
      "0 <= src, dst < n; 0 <= maxLanes <= n",
      "The budget counts lanes traversed, not depots visited.",
      "Return -1 when no route fits the budget.",
    ],
    testCases: [
      {
        input: [4, [[0, 1, 10], [1, 2, 10], [0, 2, 50], [2, 3, 10]], 0, 3, 2],
        expected: 60,
        sample: true,
      },
      {
        input: [4, [[0, 1, 10], [1, 2, 10], [0, 2, 50], [2, 3, 10]], 0, 3, 3],
        expected: 30,
        sample: true,
      },
      { input: [3, [[0, 1, 5]], 0, 2, 5], expected: -1 },
      { input: [2, [], 0, 0, 0], expected: 0 },
      { input: [3, [[0, 1, 4], [1, 2, 4]], 0, 2, 1], expected: -1 },
      { input: [3, [[0, 1, 1], [1, 2, 1], [0, 2, 7]], 0, 2, 1], expected: 7 },
      { input: [3, [[0, 1, 1], [1, 2, 1], [0, 2, 7]], 0, 2, 2], expected: 2 },
      { input: [4, [[0, 1, 1], [1, 2, 1], [2, 1, 1], [1, 3, 100]], 0, 3, 3], expected: 101 },
      { input: [2, [[0, 1, 3], [0, 1, 2]], 0, 1, 1], expected: 2 },
      { input: [5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]], 0, 4, 4], expected: 4 },
      { input: [5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]], 0, 4, 3], expected: -1 },
    ],
    discussionAngles: [
      "Expect Dijkstra, and let them commit to it before you push. Then ask the question that breaks it: Dijkstra settles a depot at its cheapest cost and never revisits, but here a *more expensive* route into a depot can be the only one that leaves budget to finish. Ask them to construct an input where plain Dijkstra gives the wrong answer. The realisation that cost alone is no longer a sufficient state — it must be (depot, lanes used) — is the entire problem.",
      "Once they have the insight, two roads open: Dijkstra over the expanded state space (depot, lanesUsed), or Bellman-Ford style relaxation run exactly maxLanes + 1 rounds. Ask for both and for their costs — O(maxLanes * E) is the cleaner bound here and it's simpler to get right. Let them choose, but make them justify.",
      "If they go the relaxation route, this is the bug to hunt for: relaxing in place lets a shipment use two lanes within a single round, quietly exceeding the budget. Each round must read from a snapshot of the previous round's costs. Ask them what happens without the copy and make them trace it — it's the difference between a correct solution and one that returns 30 for the first sample.",
      "Probe the budget definition. maxLanes = 0 means only src == dst is reachable, at cost 0. The [2, [], 0, 0, 0] test pins it. Ask what their code returns when src == dst — an uninitialised distance table or a missing base case shows up immediately here.",
      "Ask why cycles aren't a problem despite the graph having them. The budget bounds the number of rounds, so nothing can loop forever — and a lane cap makes even negative costs safe, unlike unbounded Bellman-Ford. Worth asking whether they'd still need the negative-cycle check.",
    ],
    optimalComplexity: "O(maxLanes * e) time, O(n) space",
    edgeCases: [
      "Origin equals destination — cost 0, regardless of budget.",
      "A route that exists but needs more lanes than the budget allows — -1, not the over-budget cost.",
      "A cheap long route losing to an expensive short one because of the cap.",
      "Parallel lanes between the same pair, where the cheapest must win.",
      "A destination unreachable at any budget.",
    ],
  },
  {
    id: "hoist-lift-sequences",
    title: "Hoist Lift Sequences",
    difficulty: "easy",
    topic: "dp",
    statement: `A gantry hoist raises a crate from the ground to a target level. Its controller accepts
exactly two commands: lift one level, or lift two levels. The crate starts at level 0 and
must finish exactly at the target — overshooting is not allowed. Two lift plans are different
if their command sequences differ, even when they use the same commands in a different order.
Given the target level, return how many distinct lift plans reach it. A target of 0 means the
crate is already there, which counts as one plan: issue no commands.

Example:

    levels = 4  ->  5
    levels = 1  ->  1`,
    signatures: {
      python: "def liftSequences(levels: int) -> int:",
      javascript: "function liftSequences(levels)",
      cpp: "int liftSequences(int levels)",
      java: "int liftSequences(int levels)",
    },
    constraints: [
      "0 <= levels <= 45",
      "Only lifts of 1 or 2 levels are available.",
      "The result is guaranteed to fit in a signed 32-bit integer.",
      "A target of 0 has exactly one plan: the empty sequence.",
    ],
    testCases: [
      { input: [4], expected: 5, sample: true },
      { input: [1], expected: 1, sample: true },
      { input: [0], expected: 1 },
      { input: [2], expected: 2 },
      { input: [3], expected: 3 },
      { input: [10], expected: 89 },
      { input: [30], expected: 1346269 },
      { input: [45], expected: 1836311903 },
    ],
    discussionAngles: [
      "Get the recurrence from them by asking about the *last* command, not the first: any plan ending at level n arrived from n-1 or n-2, and those sets are disjoint and cover everything. Disjoint and exhaustive is why it's a sum rather than something messier — make them say both words.",
      "They will notice it's Fibonacci. Ask them to justify the indexing rather than accept the pattern-match, because the base cases are where this goes wrong: with the empty sequence counted, f(0) = 1 and f(1) = 1. A candidate who sets f(0) = 0 gets a shifted sequence and fails every test.",
      "Walk the space ladder deliberately: naive recursion is O(2^n) and dies well before 45; memoised is O(n) time and O(n) space; two rolling scalars are O(1) space. Ask what the memo table is actually storing and whether they ever need more than the last two entries — that question makes the final step obvious rather than magic.",
      "The 45 cap is not arbitrary. Ask what it's protecting: f(45) is 1,836,311,903, just under the signed 32-bit limit of 2,147,483,647, and f(46) overflows. A candidate who spots that the constraint encodes an overflow boundary is reading specs the way you want.",
      "If time allows: what if the hoist also had a three-level lift? The recurrence gains a term and the base cases shift. It's a quick check that they understand the derivation rather than the formula.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "A target of 0 — one plan, not zero.",
      "Targets of 1 and 2, which pin the base cases.",
      "The maximum target of 45, which sits just inside the 32-bit range.",
    ],
  },
  {
    id: "best-trading-stretch",
    title: "Best Trading Stretch",
    difficulty: "medium",
    topic: "dp",
    statement: `A trading bot logs its profit or loss for every hour it ran; a loss is recorded as a
negative number. To decide whether the bot is worth keeping, the desk wants its best possible
showing: the largest total over any single unbroken stretch of hours. The stretch must be at
least one hour long, so even a bot that lost money every hour has a best stretch — the hour it
lost the least. Return the total for that stretch. An empty log means the bot never ran;
report 0.

Example:

    deltas = [3, -4, 5, -1, 6, -9]  ->  10   (the stretch 5, -1, 6)
    deltas = [-8, -2, -5]           ->  -2`,
    signatures: {
      python: "def bestStretch(deltas: List[int]) -> int:",
      javascript: "function bestStretch(deltas)",
      cpp: "int bestStretch(vector<int>& deltas)",
      java: "int bestStretch(int[] deltas)",
    },
    constraints: [
      "0 <= deltas.length <= 10^5",
      "-10^4 <= deltas[i] <= 10^4",
      "The stretch must be contiguous and at least one hour long.",
      "An empty log returns 0.",
    ],
    testCases: [
      { input: [[3, -4, 5, -1, 6, -9]], expected: 10, sample: true },
      { input: [[-8, -2, -5]], expected: -2, sample: true },
      { input: [[]], expected: 0 },
      { input: [[7]], expected: 7 },
      { input: [[-7]], expected: -7 },
      { input: [[0, 0, 0]], expected: 0 },
      { input: [[2, 2, 2, 2]], expected: 8 },
      { input: [[-1, 4, -2, 4, -1]], expected: 6 },
      { input: [[5, -10, 5]], expected: 5 },
    ],
    discussionAngles: [
      "The all-negative case is the entire point of this problem, so let them write the version that initialises the running total to 0 and then hand them [-8, -2, -5]. It returns 0 — a stretch of no hours, which the spec forbids. Watching a candidate discover that their clean-looking code answers a different question is more valuable than telling them.",
      "Make them state the subproblem precisely. It is not 'the best stretch in the first i hours' — it's 'the best stretch *ending exactly at* hour i', and the global answer is the max over all those. Candidates who can't articulate the 'ending at' part have memorised Kadane and will misapply it the moment the problem shifts.",
      "The recurrence deserves a why: at each hour, extend the previous stretch or start fresh here, whichever is larger. Ask when starting fresh wins — precisely when the running total has gone negative, because a negative prefix can only drag down whatever follows. That sentence is the algorithm.",
      "Ask for the divide-and-conquer solution as a contrast: split, best-left, best-right, best-crossing, O(n log n). It's worth knowing they can see more than one decomposition, and the crossing case is a nice test of care.",
      "Good extension if they're fast: return the stretch's start and end hours, not just the total. It's a small change — track where the current stretch began — but it exposes whether they actually understand their own loop.",
    ],
    optimalComplexity: "O(n) time, O(1) space",
    edgeCases: [
      "Empty log returns 0, but an all-negative log must return its least-negative hour, not 0.",
      "A single hour, positive or negative.",
      "All zeros.",
      "A large loss splitting two equally good stretches, where neither should be merged across it.",
    ],
  },
  {
    id: "minimum-crate-fill",
    title: "Minimum Crates to Fill an Order",
    difficulty: "medium",
    topic: "dp",
    statement: `A depot ships bulk goods in standard crate sizes, with unlimited stock of every size. An
order must be filled to its exact weight — the customer rejects both short and over shipments
— using as few crates as possible, since each crate costs a handling fee. Given the available
crate sizes and a target weight, return the smallest number of crates that sums to exactly the
target, or -1 if the target cannot be hit exactly. A target of 0 needs no crates.

Example:

    sizes = [3, 7], target = 12  ->  4   (3 + 3 + 3 + 3; no combination with 7 works)
    sizes = [2], target = 3      ->  -1`,
    signatures: {
      python: "def minCrates(sizes: List[int], target: int) -> int:",
      javascript: "function minCrates(sizes, target)",
      cpp: "int minCrates(vector<int>& sizes, int target)",
      java: "int minCrates(int[] sizes, int target)",
    },
    constraints: [
      "0 <= sizes.length <= 100",
      "1 <= sizes[i] <= 10^4",
      "0 <= target <= 10^4",
      "Every crate size is available in unlimited quantity.",
      "Return -1 if the target cannot be met exactly.",
    ],
    testCases: [
      { input: [[3, 7], 12], expected: 4, sample: true },
      { input: [[2], 3], expected: -1, sample: true },
      { input: [[1, 5, 9], 13], expected: 5 },
      { input: [[5], 0], expected: 0 },
      { input: [[], 0], expected: 0 },
      { input: [[], 4], expected: -1 },
      { input: [[1], 7], expected: 7 },
      { input: [[2, 4, 6], 7], expected: -1 },
      { input: [[4, 5, 6], 11], expected: 2 },
      { input: [[9, 6, 5, 1], 11], expected: 2 },
    ],
    discussionAngles: [
      "Almost every candidate proposes greedy — take the largest crate that fits, repeat. Do not correct them. Ask them to run it on sizes [3, 7] with target 12: greedy takes 7, leaves 5, and 5 is unreachable with 3s and 7s, so greedy reports failure on an order that needs four 3s. Making them break their own approach is worth more than any explanation, and it motivates the DP honestly.",
      "Then ask the diagnostic question: *why* does greedy fail here but work on real currency? Because most coin systems are canonical by design — greedy is provably optimal for them. A candidate who knows the property is denomination-specific and not universal is a level above one who just knows 'greedy is wrong for coin change'.",
      "Make them define the subproblem and the recurrence in words before coding: the minimum crates for weight w is one more than the best over w - size, for each size that fits. Then ask about the iteration order and why unlimited stock lets them sweep weights upward reusing the same size — that's the difference between unbounded and 0/1 knapsack, and it's exactly one loop-order detail.",
      "The -1 sentinel is a trap. Ask what happens if they store -1 in the table and then compute dp[w - size] + 1 — the unreachable marker becomes 0 and silently poisons the answer. Using infinity internally and converting once at the end is the fix. Ask them to trace [2] with target 3.",
      "Ask for the complexity in terms of both inputs: O(target * k). Then ask whether that's polynomial in the input *size* — it isn't, it's pseudo-polynomial, since target is a value not a length. Not everyone will know this, but it's a good ceiling probe.",
    ],
    optimalComplexity: "O(target * k) time, O(target) space",
    edgeCases: [
      "A target of 0 — zero crates, even when no sizes are available.",
      "No crate sizes at all with a positive target — -1.",
      "A target that is unreachable for a parity or divisibility reason, e.g. an odd target from even-only sizes.",
      "A target where greedy picks a large crate and strands the remainder.",
    ],
  },
  {
    id: "shared-firmware-changes",
    title: "Shared Firmware Change Sequence",
    difficulty: "medium",
    topic: "dp",
    statement: `Two firmware branches each keep a changelog: a string where every character is a one-letter
code for a change that landed, in the order it landed. Release engineering wants to know how
much of the two branches' history genuinely lines up, which they define as the length of the
longest sequence of change codes appearing in both logs in the same relative order. The
sequence need not be contiguous in either log — unrelated changes may be interleaved between
the matching ones — but the order must be respected. Return that length.

Example:

    a = "hotdog", b = "hood"  ->  3   (e.g. "hod")
    a = "abc",    b = "xyz"   ->  0`,
    signatures: {
      python: "def sharedChangeRun(a: str, b: str) -> int:",
      javascript: "function sharedChangeRun(a, b)",
      cpp: "int sharedChangeRun(string a, string b)",
      java: "int sharedChangeRun(String a, String b)",
    },
    constraints: [
      "0 <= a.length, b.length <= 1000",
      "a and b contain lowercase ASCII letters only.",
      "The shared sequence need not be contiguous, but relative order must hold.",
    ],
    testCases: [
      { input: ["hotdog", "hood"], expected: 3, sample: true },
      { input: ["abc", "xyz"], expected: 0, sample: true },
      { input: ["", "abc"], expected: 0 },
      { input: ["", ""], expected: 0 },
      { input: ["aaa", "aa"], expected: 2 },
      { input: ["a", "a"], expected: 1 },
      { input: ["stack", "tracks"], expected: 4 },
      { input: ["xyz", "xyz"], expected: 3 },
      { input: ["abcdef", "fedcba"], expected: 1 },
    ],
    discussionAngles: [
      "Draw out the 'not contiguous' consequence first. Ask whether a sliding window or a two-pointer scan could work — they can't, because skipping is allowed on both sides independently, and that freedom is what forces a two-dimensional table. Candidates who try to force a linear scan here need to hit the wall before they'll accept the DP.",
      "Get the recurrence from the *last* characters of each prefix. If they match, the answer extends the shorter-by-one-on-both-sides subproblem. If they don't, at least one of the two characters is unusable, so take the better of dropping either. Ask why it's max of two and not three — dropping both is dominated by dropping either one alone. That question catches a lot of hand-waving.",
      "Ask for the space. The natural table is O(m*n), but each row only reads the row above it, so two rows suffice — and then O(min(m, n)) by orienting the shorter string along the row. Ask what they lose by rolling rows: the ability to backtrack and reconstruct the actual sequence, not just its length. Since the spec only wants a length, that's a real and defensible trade.",
      "\"abcdef\" against \"fedcba\" is a deliberate test. Ask what the answer is before they run it — every character is shared, but reversal means no two can be used together, so the answer is 1. Candidates whose intuition says 6 are conflating this with a set intersection, which is the misconception this problem is for.",
      "If they're strong: ask what happens at length 10^5 instead of 1000. The O(m*n) table is 10^10 cells and dead. That's where the constraint is doing the work, and Hunt-Szymanski or a patience-sorting reduction are the honest answers — knowing the standard DP has a ceiling is enough.",
    ],
    optimalComplexity: "O(m*n) time, O(min(m, n)) space",
    edgeCases: [
      "Either log empty — the answer is 0.",
      "No shared codes at all.",
      "Identical logs, where the answer is the full length.",
      "One log a reversal of the other, where all codes are shared but only one can be used.",
      "Repeated codes, e.g. 'aaa' against 'aa', where multiplicity is capped by the shorter log.",
    ],
  },
  {
    id: "log-route-rule-match",
    title: "Log Routing Rule Match",
    difficulty: "hard",
    topic: "dp",
    statement: `Log channels are routed by rules written in a small pattern language. A rule is matched
against a channel name in full — a rule that matches only a prefix does not route. Most of a
rule is ordinary characters that must match exactly, plus two wildcards: '?' matches exactly
one character, and '*' matches any run of characters, including an empty one. Given a channel
name and a rule, report whether the rule routes that channel.

Example:

    channel = "metrics", rule = "me*s"     ->  true   ('*' absorbs "tric")
    channel = "metrics", rule = "me?ics"   ->  false  ('?' takes one character, leaving a length mismatch)`,
    signatures: {
      python: "def ruleMatches(channel: str, rule: str) -> bool:",
      javascript: "function ruleMatches(channel, rule)",
      cpp: "bool ruleMatches(string channel, string rule)",
      java: "boolean ruleMatches(String channel, String rule)",
    },
    constraints: [
      "0 <= channel.length, rule.length <= 2000",
      "channel contains lowercase ASCII letters only.",
      "rule contains lowercase ASCII letters, '?' and '*'.",
      "The match must cover the entire channel name.",
    ],
    testCases: [
      { input: ["metrics", "me*s"], expected: true, sample: true },
      { input: ["metrics", "me?ics"], expected: false, sample: true },
      { input: ["", "*"], expected: true },
      { input: ["", ""], expected: true },
      { input: ["", "?"], expected: false },
      { input: ["a", "*"], expected: true },
      { input: ["abc", "***"], expected: true },
      { input: ["abc", "a*c"], expected: true },
      { input: ["abc", "a?c"], expected: true },
      { input: ["abc", "ab"], expected: false },
      { input: ["abc", "abcd"], expected: false },
      { input: ["logs", "l?gs"], expected: true },
      { input: ["logs", "?ogs"], expected: true },
      { input: ["aab", "c*a*b"], expected: false },
      { input: ["telemetry", "te*e*ry"], expected: true },
      { input: ["telemetry", "te*x*ry"], expected: false },
    ],
    discussionAngles: [
      "Start by making them state precisely what '*' can do, because the vague version — 'it matches stuff' — is what makes this problem hard. It matches *any* run including empty, which means at every '*' the algorithm faces an unbounded branch. Ask how many ways a rule with three stars can split a 2000-character channel. That number is why greedy-without-backtracking fails and why the DP exists.",
      "The table is dp[i][j] = does the first i characters of the channel match the first j of the rule. The star transition is the one to interrogate: dp[i][j] = dp[i][j-1] (star absorbs nothing) OR dp[i-1][j] (star absorbs one more character). Ask them to explain the second term in words — the star stays live and eats another character — because candidates who can't say it write the recurrence with the indices transposed.",
      "The base row is where most solutions actually break, and it's worth waiting for. dp[0][0] is true, and dp[0][j] is true only while the rule is all stars so far — a leading run of stars can match the empty channel, but the first non-star kills it forever. Candidates who initialise the row to all-false pass every test with a non-empty channel and fail [\"\", \"*\"] and [\"abc\", \"***\"]. Hand them those two.",
      "Once the DP is correct, ask for the greedy alternative: walk both strings, and on a mismatch fall back to the last '*' seen, having it absorb one more character. It's O(m + n) space O(1) and it's what real glob matchers ship. Ask what it costs — the worst case is still quadratic in time — and which they'd rather have reviewed by a colleague. There's no single right answer and the reasoning is the signal.",
      "Ask how this changes if '*' meant 'one or more' instead of 'zero or more'. It's a small edit to one term, and knowing which one confirms they built the recurrence rather than recalled it.",
    ],
    optimalComplexity: "O(m*n) time, O(n) space with a rolling row",
    edgeCases: [
      "Empty channel against an empty rule, an all-star rule, and a '?' rule.",
      "Consecutive stars, which must not be treated as needing separate characters.",
      "A rule that matches a prefix but not the whole channel.",
      "A leading literal that fails immediately regardless of later stars.",
      "Length mismatch caused by '?', which consumes exactly one character.",
    ],
  },
];
