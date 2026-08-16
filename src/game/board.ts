// Rules of play, as pure functions over a puzzle plus the player's marks.
// The hook in `src/state/useGame.ts` owns *when* these are called; this module
// owns what is legal, so the whole rulebook is testable without a renderer.
//
// A board is played in two phases:
//
//   **Deduce** — every cell is marked either "there is road here" (✓, placed by
//   double tap) or "there is none" (✕, single tap or a swipe). ✓ is the
//   committing move and is checked against the solution — a wrong one is
//   refused and costs a heart. ✕ is only a note: it is never checked, so
//   sweeping a finished row costs nothing and a wrong ✕ just sits there being
//   wrong. That asymmetry is the whole feel of the mode — you may scribble
//   freely, but you may not *claim* freely.
//
//   **Connect** — the shape of the route is still unknown, and the player drags
//   from the entry terminal through the ✓ cells to lay the actual road. Only
//   moves that could belong to the solution are accepted, so the drag can wander
//   but can never draw something wrong. Dragging the road into a square nothing
//   is known about *claims* it — same commitment, same heart if it is wrong —
//   which is the deduction move made with the same finger that lays the road.
//
// The two overlap: road may be laid **at any point**, not only once every road
// cell has been found, because a partly-deduced board often already has an
// obvious stretch of road in it and making the player hold that in their head
// until the end is busywork. `connectStep` only ever accepts a claimed cell, and
// a claim is checked, so early road are as safe as late ones — the phase flip
// marks when the *last* road becomes drawable, not when the first one does.

import {
  adjacent,
  bit,
  dirBetween,
  hasDir,
  key,
  otherDir,
  same,
  type Coord,
  type Piece,
  type Puzzle,
} from "./types";

export const MARK_NONE = 0;
export const MARK_ROAD = 1;
export const MARK_BLOCKED = 2;

/** One byte per cell, row-major. See the `MARK_*` constants. */
export type Marks = Uint8Array;

export const markAt = (marks: Marks, size: number, r: number, c: number): number =>
  marks[r * size + c];

/** Fresh marks for a puzzle: the revealed pieces already count as found road. */
export function initialMarks(puzzle: Puzzle): Marks {
  const marks = new Uint8Array(puzzle.size * puzzle.size);
  for (const { r, c } of puzzle.fixed) marks[r * puzzle.size + c] = MARK_ROAD;
  return marks;
}

export const withMark = (marks: Marks, size: number, r: number, c: number, m: number): Marks => {
  const next = marks.slice();
  next[r * size + c] = m;
  return next;
};

export const isRoadCell = (puzzle: Puzzle, r: number, c: number): boolean =>
  puzzle.solution[r][c] !== 0;

/** Road cells the player has claimed in a row (revealed pieces included). */
export function rowFound(puzzle: Puzzle, marks: Marks, r: number): number {
  let n = 0;
  for (let c = 0; c < puzzle.size; c++) if (markAt(marks, puzzle.size, r, c) === MARK_ROAD) n++;
  return n;
}

export function colFound(puzzle: Puzzle, marks: Marks, c: number): number {
  let n = 0;
  for (let r = 0; r < puzzle.size; r++) if (markAt(marks, puzzle.size, r, c) === MARK_ROAD) n++;
  return n;
}

/**
 * True when the player has crossed out so much of a line that its clue can no
 * longer be met. Nothing enforces this — crosses are notes and stay wrong until
 * the player says otherwise — but the clue turns red, which is how a bad
 * assumption gets caught before it has been built on for ten more moves.
 */
export function lineOverCrossed(puzzle: Puzzle, marks: Marks, index: number, column: boolean) {
  const { size } = puzzle;
  let blocked = 0;
  for (let i = 0; i < size; i++) {
    const m = column ? markAt(marks, size, i, index) : markAt(marks, size, index, i);
    if (m === MARK_BLOCKED) blocked++;
  }
  const clue = column ? puzzle.cols[index] : puzzle.rows[index];
  return size - blocked < clue;
}

/**
 * Cells the board crosses out on the player's behalf: everything left over in a
 * row or column whose clue is already accounted for. Derived rather than stored,
 * so it can never drift out of step with the marks — and so undoing a ✓ takes
 * its knock-on ✕s with it.
 */
export function isAutoBlocked(puzzle: Puzzle, marks: Marks, r: number, c: number): boolean {
  if (markAt(marks, puzzle.size, r, c) !== MARK_NONE) return false;
  return (
    rowFound(puzzle, marks, r) >= puzzle.rows[r] || colFound(puzzle, marks, c) >= puzzle.cols[c]
  );
}

/** Total road cells in the solution. */
export const roadTotal = (puzzle: Puzzle): number => puzzle.path.length;

export function foundTotal(marks: Marks): number {
  let n = 0;
  for (let i = 0; i < marks.length; i++) if (marks[i] === MARK_ROAD) n++;
  return n;
}

/**
 * Squares the player has crossed out by hand. Auto-crosses are derived rather
 * than stored, so they are deliberately not counted here — this is a tally of
 * what the *player* did, which is what makes it usable as "a mark just went
 * down" or "a mark just came back up".
 */
export function blockedTotal(marks: Marks): number {
  let n = 0;
  for (let i = 0; i < marks.length; i++) if (marks[i] === MARK_BLOCKED) n++;
  return n;
}

/** True once every road cell has been claimed — time to lay the road. */
export const deductionComplete = (puzzle: Puzzle, marks: Marks): boolean =>
  foundTotal(marks) === roadTotal(puzzle);

// --- Connect phase ---------------------------------------------------------

/**
 * Extend or retreat the drawn route so that it ends at `target`, or return null
 * when that move isn't legal. Returning the whole route (rather than mutating)
 * keeps the caller's undo trivial: the previous array is still the previous
 * state.
 *
 * Legal moves are: starting on the entry cell, stepping back onto the previous
 * cell, or stepping onto an adjacent claimed cell that the route hasn't used —
 * provided the piece that step would draw agrees with any piece already showing
 * on the board.
 */
export function connectStep(
  puzzle: Puzzle,
  marks: Marks,
  route: Coord[],
  target: Coord,
): Coord[] | null {
  const { size, entry, exit } = puzzle;
  if (target.r < 0 || target.c < 0 || target.r >= size || target.c >= size) return null;

  if (route.length === 0) {
    return same(target, { r: entry.r, c: entry.c }) ? [target] : null;
  }

  // Stepping back onto the previous cell rubs out the last piece.
  if (route.length >= 2 && same(target, route[route.length - 2])) {
    return route.slice(0, -1);
  }

  const head = route[route.length - 1];
  if (same(head, target)) return null;
  if (!adjacent(head, target)) return null;
  if (route.some((cell) => same(cell, target))) return null;
  // The exit is where the road leaves the board; nothing follows it.
  if (same(head, { r: exit.r, c: exit.c })) return null;
  if (markAt(marks, size, target.r, target.c) !== MARK_ROAD) return null;

  // The step fixes the head's piece — reject it if the board already shows a
  // different one there.
  const back = route.length === 1 ? entry.dir : dirBetween(head, route[route.length - 2]);
  const fwd = dirBetween(head, target);
  const drawn = shownPiece(puzzle, head.r, head.c);
  if (drawn !== null && drawn !== (bit(back) | bit(fwd))) return null;

  return [...route, target];
}

/**
 * Does a touch here take hold of the road rather than mark the square?
 *
 * True for any cell the drawn route already runs through — a finger there has
 * hold of the road, and dragging back winds it in — and, before anything is
 * drawn, for the entry, the only place a road can begin. Everything else stays a
 * deduction mark.
 *
 * This is what lets both gestures live on the same grid at the same time: road
 * are paid out *from the end of the road*, so no cell ever has to guess which of
 * the two the finger meant. It also leaves un-claiming intact — tapping a
 * claimed cell that isn't on the road still takes the claim back.
 */
export function grabsRoad(puzzle: Puzzle, route: Coord[], target: Coord): boolean {
  if (route.length === 0) return same(target, { r: puzzle.entry.r, c: puzzle.entry.c });
  return route.some((cell) => same(cell, target));
}

/**
 * A square nothing is known about yet: no mark of the player's, and not one the
 * clues have already settled. These are the only squares the road is allowed to
 * be pushed into.
 *
 * The auto-crossed half matters more than it looks. Because every ✓ is true, a
 * line whose count is accounted for genuinely has no road left in it — so an
 * auto-crossed square is *provably* empty, and letting the road try one would be
 * a trap that always costs a heart.
 */
export function isUnknown(puzzle: Puzzle, marks: Marks, r: number, c: number): boolean {
  const { size } = puzzle;
  if (r < 0 || c < 0 || r >= size || c >= size) return false;
  return markAt(marks, size, r, c) === MARK_NONE && !isAutoBlocked(puzzle, marks, r, c);
}

/** What the road's next step towards a dragged-at cell would be. */
export type PaveStep =
  /** Legal with the board as it stands. */
  | { kind: "move"; route: Coord[] }
  /** Legal only if this square holds road — pushing here is a claim. */
  | { kind: "claim"; cell: Coord };

/**
 * One step of the road towards `target`, or null if it can't go that way.
 *
 * A fast drag lands diagonally, so the road is paid out along an L — one legal
 * step at a time, longer leg first — rather than snapped to wherever the finger
 * landed. Callers loop until this returns null.
 *
 * Two passes, and the order is the point. A step onto a square the player has
 * already claimed is *known* to be safe, so it always wins. Only when there is
 * no such step does the road push into a square nothing is known about, and that
 * push is a **claim**: the same commitment as a double tap, checked the same way
 * and costing a heart when it is wrong. It has to be — a push that were merely
 * refused would turn the drag into a free oracle for "is there road here", and
 * the deduction is the game.
 */
export function paveStep(
  puzzle: Puzzle,
  marks: Marks,
  route: Coord[],
  target: Coord,
): PaveStep | null {
  const head = route[route.length - 1];
  if (!head || same(head, target)) return null;

  const dr = Math.sign(target.r - head.r);
  const dc = Math.sign(target.c - head.c);
  const cands: Coord[] = [];
  if (Math.abs(target.r - head.r) >= Math.abs(target.c - head.c)) {
    if (dr) cands.push({ r: head.r + dr, c: head.c });
    if (dc) cands.push({ r: head.r, c: head.c + dc });
  } else {
    if (dc) cands.push({ r: head.r, c: head.c + dc });
    if (dr) cands.push({ r: head.r + dr, c: head.c });
  }

  for (const cand of cands) {
    const next = connectStep(puzzle, marks, route, cand);
    if (next) return { kind: "move", route: next };
  }
  for (const cand of cands) {
    if (!isUnknown(puzzle, marks, cand.r, cand.c)) continue;
    // Ask the same rules again as if the square were claimed: that way a push
    // the geometry forbids anyway is refused for free, without a heart.
    const asIf = withMark(marks, puzzle.size, cand.r, cand.c, MARK_ROAD);
    if (connectStep(puzzle, asIf, route, cand)) return { kind: "claim", cell: cand };
  }
  return null;
}

/**
 * The part of a drawn route the marks still back up.
 *
 * Because road can be laid mid-deduction, a claim can be taken back underneath
 * one that is already drawn. The road is then cut at that cell and the rest
 * discarded — which is what the player would do by hand, and keeps the invariant
 * `connectStep` relies on: every cell of the route is claimed.
 */
export function trimRoute(puzzle: Puzzle, marks: Marks, route: Coord[]): Coord[] {
  for (let i = 0; i < route.length; i++) {
    const { r, c } = route[i];
    if (markAt(marks, puzzle.size, r, c) !== MARK_ROAD) return route.slice(0, i);
  }
  return route;
}

/** The piece printed on the board from the start, if this cell has one. */
export function shownPiece(puzzle: Puzzle, r: number, c: number): Piece | null {
  for (const cell of puzzle.fixed) {
    if (cell.r === r && cell.c === c) return puzzle.solution[r][c];
  }
  return null;
}

/**
 * True when the drawn route is the finished road: every claimed cell used, and
 * it leaves the board through the exit the way the exit piece says it does.
 */
export function connectComplete(puzzle: Puzzle, route: Coord[]): boolean {
  if (route.length !== roadTotal(puzzle)) return false;
  const head = route[route.length - 1];
  const { exit } = puzzle;
  if (!same(head, { r: exit.r, c: exit.c })) return false;
  const back = dirBetween(head, route[route.length - 2]);
  return (bit(back) | bit(exit.dir)) === puzzle.solution[exit.r][exit.c];
}

/**
 * The pieces a drawn route puts on the board, keyed by cell.
 *
 * The moving end of the route gets a **stub** — a mask with a single bit, the
 * edge it came in by — which is what makes the road look like it is being paid
 * out under the finger rather than snapping between whole pieces.
 *
 * **A printed piece is never redrawn.** The pieces the board gives away at the
 * start are fixed facts, and the road passing over one must not restate it: a
 * stub laid on a printed piece would rub out the shape the player was given and
 * is entitled to keep reading, right at the moment they are using it to work out
 * where the route goes next. Nothing is lost by leaving it — `connectStep`
 * already refuses any step that would disagree with a printed piece, so the mask
 * the route implies there is the printed one anyway once the road has passed
 * through. Where the road's end has got to is said by the highlight instead.
 */
export function routePieces(puzzle: Puzzle, route: Coord[]): Map<number, Piece> {
  const out = new Map<number, Piece>();
  const complete = connectComplete(puzzle, route);
  for (let i = 0; i < route.length; i++) {
    const cell = route[i];
    const printed = shownPiece(puzzle, cell.r, cell.c);
    if (printed !== null) {
      out.set(key(cell.r, cell.c), printed);
      continue;
    }
    const back = i === 0 ? puzzle.entry.dir : dirBetween(cell, route[i - 1]);
    let mask = bit(back);
    if (i < route.length - 1) mask |= bit(dirBetween(cell, route[i + 1]));
    else if (complete) mask |= bit(puzzle.exit.dir);
    out.set(key(cell.r, cell.c), mask);
  }
  return out;
}

/**
 * The next cell the route should take, for the hint button: replays the true
 * solution up to wherever the player has drawn to, then hands back the step
 * after it. Returns null once the route is finished — or if it has wandered off
 * the solution, which `connectStep` should already have made impossible.
 */
export function nextRouteCell(puzzle: Puzzle, route: Coord[]): Coord | null {
  if (route.length === 0) return { r: puzzle.entry.r, c: puzzle.entry.c };
  for (let i = 0; i < route.length; i++) {
    if (!same(route[i], puzzle.path[i])) return null;
  }
  return route.length < puzzle.path.length ? puzzle.path[route.length] : null;
}

/**
 * A cell worth handing the player during deduction: an unclaimed road cell,
 * preferring one whose row or column is closest to being settled so the hint
 * lands where the reasoning was going anyway.
 */
export function hintCell(puzzle: Puzzle, marks: Marks): Coord | null {
  let best: Coord | null = null;
  let bestSlack = Infinity;
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      if (!isRoadCell(puzzle, r, c)) continue;
      if (markAt(marks, puzzle.size, r, c) === MARK_ROAD) continue;
      const slack =
        puzzle.rows[r] - rowFound(puzzle, marks, r) + (puzzle.cols[c] - colFound(puzzle, marks, c));
      if (slack < bestSlack) {
        bestSlack = slack;
        best = { r, c };
      }
    }
  }
  return best;
}

/** Does this fixed piece open onto the given edge? Used by the border arrows. */
export const pieceOpens = (p: Piece, d: 0 | 1 | 2 | 3): boolean => hasDir(p, d);

/** The single direction a stub points, or null if the mask isn't a stub. */
export function stubDir(mask: number): 0 | 1 | 2 | 3 | null {
  if (mask !== 1 && mask !== 2 && mask !== 4 && mask !== 8) return null;
  return (mask === 1 ? 0 : mask === 2 ? 1 : mask === 4 ? 2 : 3) as 0 | 1 | 2 | 3;
}

export { otherDir };
