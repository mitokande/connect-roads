// Puzzle generation. Everything here is a pure function of a 32-bit seed, so a
// level number is all that has to be stored to reproduce a board exactly.
//
// The pipeline is generate-and-test, and the **order of the two gates is the
// whole design**:
//
//   1. Pick two terminals on different sides of the board.
//   2. Random-walk from one to the other with backtracking, refusing to enter
//      the exit until the walk is long enough. Refusing early is what makes
//      paths *wind* — a walk allowed to finish as soon as it can produces a
//      boring L-shape, and length is the puzzle's whole texture.
//   3. Read the row/column clues off the finished path, and throw the walk away
//      unless its shape is worth playing (`shapeIsPlayable`).
//   4. **Is it deducible with only the two terminals showing?** Ask `deduce.ts`,
//      and bin the walk if a person could not reason it out. This runs *before
//      any reveal exists*, which is the invariant the next step depends on.
//   5. **Reveal pieces until the route's shape is unique.** Aimed, as before: a
//      cell where the rival route the solver just found disagrees with the
//      intended one, so that rival cannot survive the next pass.
//
// Step 4 before step 5 is what makes the printed pieces honest. It used to be
// step 5 alone, and the result was a bank where 80 of 120 levels could not be
// reasoned out at all — a player deduced 43% of an 8×8 and then had to guess,
// with three hearts and a checked claim. Uniqueness was never the same property
// as solvability, and only the solver was being asked.
//
// Which leaves the two jobs cleanly split, and neither doing the other's work:
//
//   the clues, alone, settle **where** the road goes
//   the printed pieces settle **what shape** it is
//
// The second is a real job, not a crutch: measured, most boards whose road *cells*
// are fully deducible still admit more than one way to route through them (8 of 8
// sampled 8×8s), because knowing which squares carry road says nothing about how
// they turn. That ambiguity is what the reveals are spent on, and because step 4
// has already passed without them, no reveal can be doing the player's deduction.

import { deduce, deduceInput, terminalCells, type Grade, type Tier } from "./deduce";
import { countSolutions } from "./solver";
import {
  bit,
  DC,
  dirBetween,
  DIRS,
  DR,
  E,
  EMPTY,
  key,
  N,
  opposite,
  S,
  W,
  type Coord,
  type Dir,
  type Piece,
  type Puzzle,
  type Terminal,
} from "./types";

export type Rng = () => number;

/** Small fast seeded PRNG — same seed, same puzzle, on every device. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: Rng, n: number) => Math.floor(rng() * n) % n;

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cells that sit on the given side, paired with the direction off the board. */
function sideCells(n: number, side: Dir): Terminal[] {
  const out: Terminal[] = [];
  for (let i = 0; i < n; i++) {
    if (side === N) out.push({ r: 0, c: i, dir: N });
    else if (side === S) out.push({ r: n - 1, c: i, dir: S });
    else if (side === W) out.push({ r: i, c: 0, dir: W });
    else out.push({ r: i, c: n - 1, dir: E });
  }
  return out;
}

/** Turn an ordered walk into the grid of pieces it lays down. */
export function piecesFromPath(
  path: Coord[],
  entry: Terminal,
  exit: Terminal,
  size: number,
): Piece[][] {
  const grid: Piece[][] = Array.from({ length: size }, () =>
    new Array<Piece>(size).fill(EMPTY),
  );
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    const back = i === 0 ? entry.dir : dirBetween(cell, path[i - 1]);
    const fwd = i === path.length - 1 ? exit.dir : dirBetween(cell, path[i + 1]);
    grid[cell.r][cell.c] = bit(back) | bit(fwd);
  }
  return grid;
}

/**
 * A self-avoiding walk from `entry` to `exit` whose length lands in
 * [minLen, maxLen], or null if the search gave up.
 */
function walk(
  size: number,
  entry: Terminal,
  exit: Terminal,
  minLen: number,
  maxLen: number,
  rng: Rng,
  budget = 40_000,
): Coord[] | null {
  const used = new Uint8Array(size * size);
  const path: Coord[] = [];
  let steps = 0;

  const inBounds = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < size && c < size;

  function dfs(r: number, c: number, from: Dir): boolean {
    path.push({ r, c });
    used[r * size + c] = 1;

    if (r === exit.r && c === exit.c) return true; // only entered once long enough

    if (path.length < maxLen) {
      for (const to of shuffled(DIRS, rng)) {
        if (++steps > budget) break;
        if (to === from) continue;
        const r2 = r + DR[to];
        const c2 = c + DC[to];
        if (!inBounds(r2, c2) || used[r2 * size + c2]) continue;
        if (r2 === exit.r && c2 === exit.c) {
          // The exit piece needs two distinct edges: one inward, one off-board.
          if (opposite(to) === exit.dir) continue;
          if (path.length + 1 < minLen) continue;
        }
        if (dfs(r2, c2, opposite(to))) return true;
      }
    }

    path.pop();
    used[r * size + c] = 0;
    return false;
  }

  return dfs(entry.r, entry.c, entry.dir) ? path : null;
}

export type GenerateOptions = {
  size: number;
  /** Extra revealed pieces on top of the ones uniqueness demands. */
  bonusReveals?: number;
  /** Fraction of the grid the road must cover, as [min, max]. */
  fill?: [number, number];
  /** How many walks to try before giving up. */
  attempts?: number;
  /**
   * The hardest deduction rule the board may require of the player. See
   * `deduce.ts` for the ladder; 4 means "never needs assume-and-refute".
   */
  maxTier?: Tier;
  /**
   * Fewest lines with an *extreme* clue (1, n−1, or n) the board may open with.
   *
   * These are where line counting bites, so they are the deduction's footholds.
   * The old bank had them collapse exactly where they were needed most — 4.0 of
   * 8 lines on a 4×4 but only 2.4 of 16 on an 8×8, a quarter of the density on
   * the boards that are already hardest.
   *
   * **0 is not on that list any more, because a 0 clue can no longer happen.**
   * Every row and column carries road (`touchesEveryLine`), so the cheapest
   * foothold there is — a line the player can sweep without reading anything
   * else — is gone by construction, and 1 takes its place: a line owing exactly
   * one square is the tightest clue the board can now print.
   */
  minExtremeLines?: number;
};

/**
 * At most this many reveals beyond the two terminals.
 *
 * Higher than it used to be, and for a different reason. These no longer buy
 * uniqueness the clues couldn't earn — the deducibility gate has already passed
 * without them — they buy a single route *shape*, which is a genuine need on most
 * boards. The cap is still worth having because every printed piece is one less
 * thing the connect phase asks.
 */
export const MAX_EXTRA_REVEALS = 4;

/** A quarter of the lines, so the footholds scale with the board. */
const defaultExtremeLines = (size: number) => Math.max(2, Math.round(size * 2 * 0.25));

/**
 * How many unresolved squares still make an assume-and-refute pass worth trying.
 *
 * A refutation resolves one square, which then feeds the cheap tiers and can
 * cascade — so this is generous rather than tight. It exists only because T5 on a
 * hopeless board is the most expensive thing in the build.
 */
const T5_ESCALATION_REACH = 24;

/**
 * Does the road reach every row and every column?
 *
 * The rule the bank is built on: **no clue is ever 0.** See `shapeIsPlayable`
 * for why, and `deduce.ts` — nothing in the rule engine ever needed a 0, it is
 * simply the easiest case of "this line is settled, cross the rest out".
 */
export const touchesEveryLine = (rows: number[], cols: number[]): boolean =>
  rows.every((v) => v > 0) && cols.every((v) => v > 0);

/**
 * A clue at the ends of its range — the deduction's footholds.
 *
 * `n` and `n−1` fill a line almost completely; `1` empties it almost completely.
 * 0 used to head this list and no longer occurs at all: {@link touchesEveryLine}.
 */
export const isExtreme = (v: number, size: number): boolean =>
  v === 1 || v === size - 1 || v === size;

/**
 * Is this walk worth playing, before the expensive gates get a look?
 *
 * Four cheap shape tests, all of them things the old generator left to chance:
 * no empty line, enough extreme clues to give the deduction a way in, enough
 * corners that the route reads as a route, and not so much of the road lying
 * alongside itself that the board turns to mush.
 */
function shapeIsPlayable(
  path: Coord[],
  rows: number[],
  cols: number[],
  size: number,
  minExtreme: number,
): boolean {
  // **No line may be empty.** A 0 clue is a row or column the player rules out
  // in one sweep without looking at anything else — it is a free strip of grid,
  // and on the bigger boards two or three of them turned a quarter of the puzzle
  // into filling in blanks. Every line now carries road, so every clue is a
  // number the player has to place rather than a line to cross off, and the grid
  // the deduction runs on is the whole grid.
  if (!touchesEveryLine(rows, cols)) return false;

  let extreme = 0;
  for (const v of rows) if (isExtreme(v, size)) extreme++;
  for (const v of cols) if (isExtreme(v, size)) extreme++;
  if (extreme < minExtreme) return false;

  // Corners. A route of mostly straights is a route with nothing to work out.
  let turns = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i + 1];
    if (a.r !== b.r && a.c !== b.c) turns++;
  }
  const turnRatio = turns / path.length;
  if (turnRatio < 0.4 || turnRatio > 0.8) return false;

  // Road running alongside itself is legal and interesting; a board that is
  // mostly that is unreadable at 8×8 cell sizes.
  const at = new Map<number, number>();
  path.forEach((cell, i) => at.set(key(cell.r, cell.c), i));
  let touching = 0;
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      const j = at.get(key(cell.r + dr, cell.c + dc));
      if (j !== undefined && Math.abs(j - i) !== 1) touching++;
    }
  }
  return touching / path.length <= 0.45;
}

/**
 * How much of the grid the road should cover. Bigger boards are held to a
 * *higher* floor than small ones: a sparse 8×8 leaves the clues so slack that
 * proving uniqueness means exploring a huge space, and the resulting puzzle is
 * mush to solve for the same reason. Density is both the fun and the speed.
 */
function defaultFill(size: number): [number, number] {
  if (size <= 5) return [0.45, 0.8];
  if (size === 6) return [0.48, 0.75];
  return [0.52, 0.72];
}

const gridsEqual = (a: Piece[][], b: Piece[][]): boolean =>
  a.every((row, r) => row.every((p, c) => p === b[r][c]));

/**
 * A generated board and the two difficulty readings that matter.
 *
 * `grade` is the board **as the player meets it**, pieces and all — that is what
 * the ladder sorts on, because it is what the level actually feels like.
 *
 * `gate` is the board with **only its terminals**, which is the fairness reading.
 * The two come apart: a printed piece can turn a board that needed
 * assume-and-refute into one that falls to plain counting, so `grade` can say T4
 * where `gate` says T5. Anything policing "this level must never require rule X"
 * has to read `gate` — reading `grade` lets a board whose *clues* need T5 sit in a
 * slot that forbids it, which is exactly the bug the level-90 test caught.
 */
export type GradedPuzzle = { puzzle: Puzzle; grade: Grade; gate: Grade };

/**
 * Build a board that is both **deducible** and has **one route shape**.
 * Deterministic in `seed`.
 *
 * The grade comes back alongside, measured on the board *as the player will meet
 * it* — reveals included. The gate is measured on the terminals-only board; the
 * grade is measured on the finished one. Those are deliberately two different
 * questions: the first asks whether the clues carry the puzzle, the second asks
 * how hard the thing in front of the player is, and the ladder sorts on the
 * second.
 *
 * Throws if `attempts` walks all failed, which for the shipped sizes does not
 * happen — the tests assert it across every level.
 */
export function generateGraded(seed: number, opts: GenerateOptions): GradedPuzzle {
  const { size } = opts;
  const bonusReveals = opts.bonusReveals ?? 0;
  const [minFill, maxFill] = opts.fill ?? defaultFill(size);
  const attempts = opts.attempts ?? 4000;
  const maxTier = opts.maxTier ?? 4;
  const minExtreme = opts.minExtremeLines ?? defaultExtremeLines(size);
  const minLen = Math.max(3, Math.round(size * size * minFill));
  const maxLen = Math.max(minLen + 1, Math.round(size * size * maxFill));

  const rng = mulberry32(seed);

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Terminals on two different sides — a road that enters and leaves through
    // the same edge reads as a dead end at a glance.
    const [sideA, sideB] = shuffled(DIRS, rng);
    const entry = sideCells(size, sideA)[randInt(rng, size)];
    const exit = sideCells(size, sideB)[randInt(rng, size)];
    if (entry.r === exit.r && entry.c === exit.c) continue;

    const path = walk(size, entry, exit, minLen, maxLen, rng);
    if (!path) continue;

    const solution = piecesFromPath(path, entry, exit, size);
    const rows = new Array<number>(size).fill(0);
    const cols = new Array<number>(size).fill(0);
    for (const { r, c } of path) {
      rows[r]++;
      cols[c]++;
    }

    // Cheapest gate first: is the shape worth anybody's time?
    if (!shapeIsPlayable(path, rows, cols, size, minExtreme)) continue;

    const reveals: Coord[] = [
      { r: entry.r, c: entry.c },
      { r: exit.r, c: exit.c },
    ];
    const draft: Puzzle = {
      size, rows, cols, entry, exit, solution, path, fixed: reveals, seed,
    };

    // **The deducibility gate, on the terminals alone.** Nothing is revealed yet,
    // so passing here means the *clues* carry the puzzle. Everything after this
    // point can only make the board easier, which is what stops a reveal from
    // ever standing in for a deduction the player was supposed to make.
    //
    // Two stages, purely for speed. Assume-and-refute costs a full propagation
    // per square per hypothesis, and spending it on a board that is nowhere near
    // solvable took the 8×8 worst case to eleven seconds. So the cheap tiers go
    // first, and only a board they nearly finished is worth escalating.
    const termInput = deduceInput(draft, terminalCells(draft));
    let gate = deduce(termInput, maxTier < 4 ? maxTier : 4);
    if (!gate.solved) {
      if (maxTier < 5 || gate.unknown > T5_ESCALATION_REACH) continue;
      gate = deduce(termInput, 5);
      if (!gate.solved) continue;
    }

    const fixed = new Map<number, Piece>();
    fixed.set(key(entry.r, entry.c), solution[entry.r][entry.c]);
    fixed.set(key(exit.r, exit.c), solution[exit.r][exit.c]);

    const base = { size, rows, cols, entry, exit };
    let res = countSolutions({ ...base, fixed });
    if (!res.exhausted) continue; // too slow to vouch for — try another walk

    // Now pin the *shape*. Each reveal is aimed: take a cell where the rival the
    // solver just found disagrees with the intended solution, and that rival
    // cannot survive the next pass. Revealing a random path cell instead usually
    // changes nothing and costs a full re-solve.
    let extras = 0;
    while (res.exhausted && res.count > 1 && extras < MAX_EXTRA_REVEALS) {
      const rival = res.solutions.find((s) => !gridsEqual(s, solution));
      if (!rival) break;
      const candidates = path.filter(
        (p) => !fixed.has(key(p.r, p.c)) && rival[p.r][p.c] !== solution[p.r][p.c],
      );
      if (candidates.length === 0) break;
      const pick = candidates[randInt(rng, candidates.length)];
      fixed.set(key(pick.r, pick.c), solution[pick.r][pick.c]);
      reveals.push(pick);
      extras++;
      res = countSolutions({ ...base, fixed });
    }
    if (!res.exhausted || res.count !== 1) continue;

    // Bonus reveals are difficulty, not correctness: both gates have passed, so
    // these only ever make the board friendlier.
    if (bonusReveals > 0) {
      const spare = shuffled(
        path.filter((p) => !fixed.has(key(p.r, p.c))),
        rng,
      );
      for (const cell of spare.slice(0, bonusReveals)) {
        fixed.set(key(cell.r, cell.c), solution[cell.r][cell.c]);
        reveals.push(cell);
      }
    }

    const puzzle: Puzzle = {
      size, rows, cols, entry, exit, solution, path, fixed: reveals, seed,
    };
    return { puzzle, grade: deduce(deduceInput(puzzle), maxTier).grade, gate: gate.grade };
  }

  throw new Error(`could not generate a ${size}×${size} puzzle for seed ${seed}`);
}

/** {@link generateGraded} when only the board is wanted. */
export const generatePuzzle = (seed: number, opts: GenerateOptions): Puzzle =>
  generateGraded(seed, opts).puzzle;

/**
 * Print a few more of the route's own pieces.
 *
 * Difficulty, never correctness: both gates have already passed on this board, so
 * an extra reveal can only make it friendlier. Separate from generation so the
 * bank builder can hand the grace levels their extra piece without paying for a
 * second search from the same seed.
 */
export function withBonusReveals(puzzle: Puzzle, count: number, seed: number): Puzzle {
  if (count <= 0) return puzzle;
  const taken = new Set(puzzle.fixed.map((f) => key(f.r, f.c)));
  const spare = shuffled(
    puzzle.path.filter((p) => !taken.has(key(p.r, p.c))),
    mulberry32(seed),
  );
  return { ...puzzle, fixed: [...puzzle.fixed, ...spare.slice(0, count)] };
}

/** The revealed pieces of a puzzle, in the shape the solver wants. */
export function fixedMap(puzzle: Puzzle): Map<number, Piece> {
  const map = new Map<number, Piece>();
  for (const { r, c } of puzzle.fixed) map.set(key(r, c), puzzle.solution[r][c]);
  return map;
}
