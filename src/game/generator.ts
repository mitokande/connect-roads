// Puzzle generation. Everything here is a pure function of a 32-bit seed, so a
// level number is all that has to be stored to reproduce a board exactly — no
// puzzle bank ships with the app, and a save file is just an integer.
//
// The pipeline is generate-and-test, in the only order that is cheap:
//
//   1. Pick two terminals on different sides of the board.
//   2. Random-walk from one to the other with backtracking, refusing to enter
//      the exit until the walk is long enough. Refusing early is what makes
//      paths *wind* — a walk allowed to finish as soon as it can produces a
//      boring L-shape, and length is the puzzle's whole texture.
//   3. Read the row/column clues off the finished path.
//   4. Ask the solver whether the clues admit a second route. If they do, reveal
//      one more piece and ask again; if a single extra reveal can't force
//      uniqueness, bin the path and walk a new one. Binning is cheaper than
//      revealing three pieces — a board that needs that many gives itself away.
//
// The entry and exit pieces are always revealed (the border arrow shows which
// way the road leaves, and the piece shows how it turns to get there), which is
// also what lets the solver start with a forced first move.

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
};

/** At most this many reveals beyond the two terminals. */
const MAX_EXTRA_REVEALS = 2;

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
 * Build a puzzle with exactly one solution. Deterministic in `seed`.
 *
 * Throws only if `attempts` walks in a row all failed to become unique, which
 * for the shipped sizes does not happen — the tests assert it across every
 * level.
 */
export function generatePuzzle(seed: number, opts: GenerateOptions): Puzzle {
  const { size } = opts;
  const bonusReveals = opts.bonusReveals ?? 0;
  const [minFill, maxFill] = opts.fill ?? defaultFill(size);
  const attempts = opts.attempts ?? 400;
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

    const fixed = new Map<number, Piece>();
    fixed.set(key(entry.r, entry.c), solution[entry.r][entry.c]);
    fixed.set(key(exit.r, exit.c), solution[exit.r][exit.c]);
    const reveals: Coord[] = [
      { r: entry.r, c: entry.c },
      { r: exit.r, c: exit.c },
    ];

    const base = { size, rows, cols, entry, exit };
    let res = countSolutions({ ...base, fixed });
    if (!res.exhausted) continue; // too slow to vouch for — try another walk

    // Reveal pieces until the rival routes are gone. Each reveal is aimed: take
    // a cell where the rival the solver just found disagrees with the intended
    // solution, and that rival cannot survive the next pass. Revealing a random
    // path cell instead usually changes nothing and costs a full re-solve.
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
    // Anything still ambiguous is doing the player's deduction for them by the
    // time it's pinned down — start over with a fresh walk instead.
    if (!res.exhausted || res.count !== 1) continue;

    // Bonus reveals are difficulty, not correctness: uniqueness already holds,
    // so these only ever make the board friendlier.
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

    return { size, rows, cols, entry, exit, solution, path, fixed: reveals, seed };
  }

  throw new Error(`could not generate a ${size}×${size} puzzle for seed ${seed}`);
}

/** The revealed pieces of a puzzle, in the shape the solver wants. */
export function fixedMap(puzzle: Puzzle): Map<number, Piece> {
  const map = new Map<number, Piece>();
  for (const { r, c } of puzzle.fixed) map.set(key(r, c), puzzle.solution[r][c]);
  return map;
}
