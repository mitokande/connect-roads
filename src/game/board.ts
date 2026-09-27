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
  isFogged,
  isScenery,
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

/**
 * Every square still unmarked, crossed out — what the board writes as the win
 * lands.
 *
 * A complete route ends the reasoning outright — every road square is claimed, so
 * every square without a mark is empty and the player has already proved it.
 * Writing it down leaves the finished grid stating the whole answer rather than
 * trailing the squares that were never worth the tap. (By then `sweepSettled` has
 * usually done it already: with every road square claimed, every line is full.)
 */
export function crossOutRest(marks: Marks): Marks {
  const next = marks.slice();
  for (let i = 0; i < next.length; i++) if (next[i] === MARK_NONE) next[i] = MARK_BLOCKED;
  return next;
}

/**
 * Every full line with the rest of its squares crossed out: a row or column
 * holding as many claims as its count has no road left in it, so whatever in it
 * is still unmarked is empty, and the board writes that in.
 *
 * It can never write a wrong ✕. A claim is checked when it goes down, so the
 * claims a full line holds are its road, all of it. And it knows nothing the
 * player can't see: the claims are theirs and the count is printed, which is why
 * these crosses may turn the road away for free (`isUnknown`) — a refusal there
 * tells the player only what the ✕ already says.
 *
 * Only a mark nobody has made is written: a ✕ is never doubled and a claim never
 * touched. A fogged line is left alone, since sweeping it would say what its
 * hidden count is; so is scenery, which no mark lands on.
 */
export function sweepSettled(puzzle: Puzzle, marks: Marks): Marks {
  const n = puzzle.size;
  let next: Marks | null = null;
  for (const column of [false, true]) {
    for (let i = 0; i < n; i++) {
      if (!lineSettled(puzzle, marks, i, column)) continue;
      for (let j = 0; j < n; j++) {
        const r = column ? j : i;
        const c = column ? i : j;
        if (markAt(marks, n, r, c) !== MARK_NONE || isGiven(puzzle, r, c)) continue;
        next ??= marks.slice();
        next[r * n + c] = MARK_BLOCKED;
      }
    }
  }
  return next ?? marks;
}

/**
 * A board as it opens: the printed pieces claimed, and any line they already
 * fill swept (`sweepSettled`). Anything on a board beyond this is the player's
 * doing — which is what "is there anything here to lose" has to compare against.
 */
export function openingMarks(puzzle: Puzzle): Marks {
  return sweepSettled(puzzle, initialMarks(puzzle));
}

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
  // Under fog there is no count to fall short of — and a warning would say what
  // the count is, which is the one thing fog exists to keep.
  if (isFogged(puzzle, column, index)) return false;
  const { size } = puzzle;
  let blocked = 0;
  for (let i = 0; i < size; i++) {
    const r = column ? i : index;
    const c = column ? index : i;
    if (markAt(marks, size, r, c) === MARK_BLOCKED || isScenery(puzzle, r, c)) blocked++;
  }
  const clue = column ? puzzle.cols[index] : puzzle.rows[index];
  return size - blocked < clue;
}

/**
 * Does this line's sign turn green? When its road is all found — unless fog
 * hides the count, in which case the sign has nothing it may say.
 */
export function lineSettled(puzzle: Puzzle, marks: Marks, index: number, column: boolean): boolean {
  if (isFogged(puzzle, column, index)) return false;
  const found = column ? colFound(puzzle, marks, index) : rowFound(puzzle, marks, index);
  return found >= (column ? puzzle.cols[index] : puzzle.rows[index]);
}

/** Total road cells in the solution. */
export const roadTotal = (puzzle: Puzzle): number => puzzle.path.length;

export function foundTotal(marks: Marks): number {
  let n = 0;
  for (let i = 0; i < marks.length; i++) if (marks[i] === MARK_ROAD) n++;
  return n;
}

/**
 * Squares crossed out — by the player, or by the board sweeping a full line
 * (`sweepSettled`). The sound layer listens to it for "a mark just went down" or
 * "came back up"; a sweep always rides in on a claim, and the claim's sound
 * outranks it.
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
 * the two the finger meant. A claimed cell off the road stays on the deduction
 * side, where a tap on it does nothing: a claim is permanent (see `TAP` in
 * `useGame`).
 */
export function grabsRoad(puzzle: Puzzle, route: Coord[], target: Coord): boolean {
  if (route.length === 0) return same(target, { r: puzzle.entry.r, c: puzzle.entry.c });
  return route.some((cell) => same(cell, target));
}

/**
 * A square the player has said nothing about. These are the squares the road may
 * be pushed into, and a push into one is a claim — checked, and a heart if it is
 * wrong.
 *
 * Only a ✕ on the board turns the road away, and it does so for free: the
 * player's own is their note, and a full line's is written from their checked
 * claims and a printed count (`sweepSettled`). Respecting either costs nothing,
 * because it tells them nothing the board isn't already showing.
 *
 * **The clues do not get a say here**, and that is deliberate — this reads the
 * marks and nothing else. Squares in a row or column whose count is accounted for
 * are turned away now only because the board has *drawn* a ✕ in them. They used
 * to be exempt with no ✕ there, and that read as mercy and worked as neither:
 *
 *  - It is *inconsistent*. Double-tapping such a square costs a heart (`CLAIM`
 *    asks only `isRoadCell`). The same false belief, priced two ways depending
 *    on which finger motion expressed it.
 *  - It is *silent*. There is no longer a ✕ printed there to explain the
 *    refusal, so a player who has miscounted a line pushes, watches nothing
 *    happen, and learns nothing. The heart is what says "you have miscounted".
 *  - It *punched a hole in the oracle rule*. A push must be offered even when
 *    the square turns out to be empty, or the drag becomes a free probe for
 *    "is there road here?". An exemption the player cannot see is exactly such a
 *    probe: refused means empty, at no cost.
 *
 * The flick-overshoot worry that seems to argue for the exemption is already
 * answered somewhere better — a claim that costs a heart ends the stroke, so one
 * careless drag can spend one heart, never three.
 */
export function isUnknown(puzzle: Puzzle, marks: Marks, r: number, c: number): boolean {
  const { size } = puzzle;
  if (r < 0 || c < 0 || r >= size || c >= size) return false;
  // Scenery is known — printed — so the road turns away from it for nothing, as
  // it does from the player's own ✕.
  return markAt(marks, size, r, c) === MARK_NONE && !isScenery(puzzle, r, c);
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
 *
 * **Once the deduction is done, a push claims nothing.** `deductionComplete`
 * means every road square is already claimed, so an unmarked square is empty by
 * exhaustion and the player knows it — there is no belief left to bet and nothing
 * for an oracle to reveal. What is left is one long shaping gesture, and a fast
 * drag that clips a blank square on its way round a corner is a slip of the
 * finger, not a mistaken deduction. Charging a deduction heart in the phase the
 * game has just announced is no longer about deduction reads as the board turning
 * on the player at the finish.
 *
 * Note what this is *not*: a clue-based exemption. Mid-deduction, a square whose
 * row or column is already accounted for is provably empty too — and the road
 * will still push into it and still charge, because noticing that a settled line
 * has nothing left in it is precisely the counting the player is there to do.
 * The board no longer does that step for them, so it cannot excuse them from it
 * either. The line is drawn where the game itself draws it: while road remains to
 * be found, a push is a claim.
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
  if (deductionComplete(puzzle, marks)) return null;
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
 * The longest start of a route that is legal on these marks, found by drawing it
 * again from nothing.
 *
 * This is for a route the rules didn't just watch being drawn — one coming back
 * from storage. It is walked through `connectStep` from the entry, square by
 * square, exactly as a finger would have laid it, and cut at the first step the
 * rules refuse: an unclaimed square, a jump, a square used twice, a clash with a
 * printed piece. What is left is road the player could have drawn on this board,
 * which keeps the invariant `connectStep` relies on — every cell of the route is
 * claimed — true of a restored board too.
 */
export function replayRoute(puzzle: Puzzle, marks: Marks, route: readonly Coord[]): Coord[] {
  let out: Coord[] = [];
  for (const cell of route) {
    const next = connectStep(puzzle, marks, out, cell);
    // A step back onto the previous square is a retreat to `connectStep`; in a
    // stored route it can only mean the same square listed twice.
    if (!next || next.length !== out.length + 1) break;
    out = next;
  }
  return out;
}

/**
 * A square the board has already said everything about — a printed piece, or
 * scenery — and so one the player's marks don't reach.
 */
export const isGiven = (puzzle: Puzzle, r: number, c: number): boolean =>
  shownPiece(puzzle, r, c) !== null || isScenery(puzzle, r, c);

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
 * A road square to hand the player without a reason — the hint as it used to be,
 * kept as `hint.ts`'s safety net for a board the engine has nothing to say about.
 * An unclaimed road cell, preferring one whose row or column is closest to being
 * settled so it lands where the reasoning was going anyway.
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
