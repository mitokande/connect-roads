// Exhaustive path solver. Walks every route the clues allow, from the entry
// terminal to the exit terminal, and counts how many satisfy the whole board.
//
// This is the generator's referee: a Train Tracks puzzle is only fair if it has
// exactly **one** solution, so `solve(..., limit = 2)` is the question actually
// being asked — "is there a second way to do this?" — and it stops the moment
// it knows.
//
// The search is a DFS over "which edge do I leave this cell by", with four
// prunes that do the real work:
//
//   1. **Clue floor** — never enter a row/column whose remaining count is 0.
//   2. **Clue ceiling** — a row still owing k track cells must have ≥ k cells
//      the current partial path hasn't consumed (`freeRow`/`freeCol`).
//   3. **Reach + parity** — the cells still owed must be exactly enough to get
//      from here to the exit. Grid paths change length only in steps of two, so
//      `remaining − manhattan − 1` must be non-negative *and even*; the parity
//      half of that kills roughly half the branches for free.
//   4. **Fixed pieces** — a revealed piece forces the exit edge, collapsing a
//      3-way branch to 1, and a path that arrives on an edge the piece doesn't
//      open onto is dead on the spot.
//
// `exhausted: false` means the node budget ran out before the search finished,
// so the count is a floor rather than an answer — the generator throws such
// candidates away rather than shipping a puzzle it can't vouch for.

import {
  bit,
  DC,
  DIRS,
  DR,
  hasDir,
  key,
  otherDir,
  type Dir,
  type Piece,
  type Terminal,
} from "./types";

export type SolverInput = {
  size: number;
  rows: number[];
  cols: number[];
  entry: Terminal;
  exit: Terminal;
  /** `key(r, c)` → the piece that cell is known to hold. */
  fixed: Map<number, Piece>;
};

export type SolveResult = {
  /** Number of solutions found, capped at the caller's `limit`. */
  count: number;
  /** The first solution found, as a `size × size` grid of pieces. */
  solution: Piece[][] | null;
  /**
   * Every solution found, in the order found (so at most `limit` of them). The
   * generator uses the *second* one: the cells where it disagrees with the
   * intended solution are exactly the cells worth revealing, since revealing one
   * of them is guaranteed to kill that rival rather than merely hoping to.
   */
  solutions: Piece[][][];
  /** False when the node budget ran out — `count` is then only a lower bound. */
  exhausted: boolean;
};

const DEFAULT_BUDGET = 600_000;

export function solve(
  input: SolverInput,
  limit = 2,
  budget = DEFAULT_BUDGET,
): SolveResult {
  const { size: n, rows, cols, entry, exit, fixed } = input;

  const total = rows.reduce((a, b) => a + b, 0);
  if (total !== cols.reduce((a, b) => a + b, 0)) {
    return { count: 0, solution: null, solutions: [], exhausted: true };
  }
  if (entry.r === exit.r && entry.c === exit.c) {
    return { count: 0, solution: null, solutions: [], exhausted: true };
  }

  const rowLeft = rows.slice();
  const colLeft = cols.slice();
  const freeRow = new Array<number>(n).fill(n);
  const freeCol = new Array<number>(n).fill(n);
  const grid = new Int8Array(n * n); // piece per cell, 0 = not on the path
  const used = new Uint8Array(n * n);

  let placed = 0;
  let usedFixed = 0;
  let nodes = 0;
  let count = 0;
  const solutions: Piece[][][] = [];
  let exhausted = true;
  let stop = false;

  const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;

  /** Prune 2: no row/column may owe more track than it has cells left. */
  function clueCeilingHolds(): boolean {
    for (let i = 0; i < n; i++) {
      if (rowLeft[i] > freeRow[i]) return false;
      if (colLeft[i] > freeCol[i]) return false;
    }
    return true;
  }

  function record() {
    count++;
    const out: Piece[][] = [];
    for (let r = 0; r < n; r++) {
      const row: Piece[] = [];
      for (let c = 0; c < n; c++) row.push(grid[r * n + c]);
      out.push(row);
    }
    solutions.push(out);
    if (count >= limit) stop = true;
  }

  /**
   * Enter cell (r, c) across its `from` edge and try every way out.
   * `from` points back the way we came — for the entry cell it points off-grid.
   */
  function visit(r: number, c: number, from: Dir) {
    if (stop) return;
    if (++nodes > budget) {
      exhausted = false;
      stop = true;
      return;
    }
    if (rowLeft[r] === 0 || colLeft[c] === 0) return; // prune 1

    const idx = r * n + c;
    const k = key(r, c);
    const fx = fixed.get(k);
    // Prune 4a: a revealed piece that doesn't open onto the edge we arrived by.
    if (fx !== undefined && !hasDir(fx, from)) return;

    rowLeft[r]--;
    colLeft[c]--;
    freeRow[r]--;
    freeCol[c]--;
    used[idx] = 1;
    placed++;
    if (fx !== undefined) usedFixed++;

    if (clueCeilingHolds()) {
      const remaining = total - placed;
      const atExit = r === exit.r && c === exit.c;

      if (atExit) {
        // The exit cell is terminal: its only legal way out is off the grid.
        if (from !== exit.dir) {
          const p = bit(from) | bit(exit.dir);
          if ((fx === undefined || fx === p) && remaining === 0 && usedFixed === fixed.size) {
            grid[idx] = p;
            record();
            grid[idx] = 0;
          }
        }
      } else if (remaining > 0) {
        // Prune 4b: a revealed piece forces the single edge we may leave by.
        const outs = fx !== undefined ? [otherDir(fx, from)!] : DIRS;
        for (const to of outs) {
          if (stop) break;
          if (to === from) continue;
          const r2 = r + DR[to];
          const c2 = c + DC[to];
          if (!inBounds(r2, c2) || used[r2 * n + c2]) continue;
          // Prune 3: exactly enough cells left to reach the exit from there.
          const reach = Math.abs(r2 - exit.r) + Math.abs(c2 - exit.c) + 1;
          if (remaining < reach || (remaining - reach) % 2 !== 0) continue;

          grid[idx] = bit(from) | bit(to);
          visit(r2, c2, ((to + 2) % 4) as Dir);
          grid[idx] = 0;
        }
      }
    }

    if (fx !== undefined) usedFixed--;
    placed--;
    used[idx] = 0;
    freeCol[c]++;
    freeRow[r]++;
    colLeft[c]++;
    rowLeft[r]++;
  }

  visit(entry.r, entry.c, entry.dir);

  return { count, solution: solutions[0] ?? null, solutions, exhausted };
}

/** How many solutions the clues admit, capped at `limit`. */
export function countSolutions(input: SolverInput, limit = 2, budget?: number): SolveResult {
  return solve(input, limit, budget);
}

/** The first solution, or null when there is none (or the budget ran out). */
export function findSolution(input: SolverInput, budget?: number): Piece[][] | null {
  const res = solve(input, 1, budget);
  return res.exhausted || res.count > 0 ? res.solution : null;
}
