// Core vocabulary for the puzzle — the newspaper one called Train Tracks,
// which this game dresses as roads and cars.
//
// The board is an n×n grid. A **road piece** occupies a cell and joins exactly
// two of its four edges, so a piece is nothing more than a 2-bit mask of the
// directions it opens onto — which makes "does this piece meet that one" a
// bitwise test rather than a table lookup. There are six pieces: two straights
// (opposite dirs) and four curves (adjacent dirs).
//
// The solution is a single **path**: an ordered list of cells that enters the
// grid at `entry` and leaves it at `exit`, never re-using a cell. Two cells of
// the path may sit side by side without being joined (the road runs alongside
// itself) — that is legal and common; the only hard rule is one piece per cell.

/** N, E, S, W. The grid's y axis points down, so S is `row + 1`. */
export type Dir = 0 | 1 | 2 | 3;

export const N = 0 as Dir;
export const E = 1 as Dir;
export const S = 2 as Dir;
export const W = 3 as Dir;

export const DIRS: Dir[] = [N, E, S, W];

/** Row delta per direction. */
export const DR = [-1, 0, 1, 0];
/** Column delta per direction. */
export const DC = [0, 1, 0, -1];

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

/** The single-bit mask for a direction. */
export const bit = (d: Dir): number => 1 << d;

/**
 * A road piece as a mask of the two edges it opens onto; `EMPTY` (0) means the
 * cell holds no road. Never construct one by hand — use {@link piece}.
 */
export type Piece = number;

export const EMPTY: Piece = 0;

export const piece = (a: Dir, b: Dir): Piece => bit(a) | bit(b);

/** The six legal pieces. */
export const VERT = piece(N, S); // 5
export const HORZ = piece(E, W); // 10
export const NE = piece(N, E); // 3
export const SE = piece(S, E); // 6
export const SW = piece(S, W); // 12
export const NW = piece(N, W); // 9

export const PIECES: Piece[] = [VERT, HORZ, NE, SE, SW, NW];

export const hasDir = (p: Piece, d: Dir): boolean => (p & bit(d)) !== 0;

export const isCurve = (p: Piece): boolean => p !== VERT && p !== HORZ && p !== EMPTY;

/** The two directions of a piece, in N/E/S/W order. */
export function dirsOf(p: Piece): Dir[] {
  const out: Dir[] = [];
  for (const d of DIRS) if (hasDir(p, d)) out.push(d);
  return out;
}

/** Given a piece and one of its ends, the other end. */
export function otherDir(p: Piece, d: Dir): Dir | null {
  for (const o of DIRS) if (o !== d && hasDir(p, o)) return o;
  return null;
}

export type Coord = { r: number; c: number };

export const same = (a: Coord, b: Coord): boolean => a.r === b.r && a.c === b.c;

export const adjacent = (a: Coord, b: Coord): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

/** The direction travelled to get from `a` to the adjacent cell `b`. */
export function dirBetween(a: Coord, b: Coord): Dir {
  for (const d of DIRS) if (a.r + DR[d] === b.r && a.c + DC[d] === b.c) return d;
  throw new Error(`cells (${a.r},${a.c}) and (${b.r},${b.c}) are not adjacent`);
}

/** Where the road crosses the border. `dir` points *off* the grid. */
export type Terminal = { r: number; c: number; dir: Dir };

export type Puzzle = {
  size: number;
  /** Road cells per row, top → bottom. */
  rows: number[];
  /** Road cells per column, left → right. */
  cols: number[];
  entry: Terminal;
  exit: Terminal;
  /** `size × size` of {@link Piece}; `EMPTY` where the solution has no road. */
  solution: Piece[][];
  /** The solution as an ordered walk, `entry` cell first, `exit` cell last. */
  path: Coord[];
  /**
   * Cells whose piece is on the board from the start. Always begins with the
   * entry and exit cells (their pieces are implied by the border arrows), then
   * any extra reveals the generator needed to force a unique solution.
   */
  fixed: Coord[];
  seed: number;
};

/** What the player has asserted about a cell during the deduction phase. */
export type Mark = "none" | "road" | "blocked";

export const key = (r: number, c: number): number => r * 100 + c;
