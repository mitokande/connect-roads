// A board in progress, as it is kept between sessions.
//
// An 8×8 is ten minutes of work, and a phone interrupts: a call, the back
// gesture, the map button, the app being swept away. Every one of those used to
// throw the board away — opening a level always dealt a fresh one — so the only
// safe way to play a big board was in one sitting. Now each unfinished board is
// kept, per level, and opening the level again picks it up where it was left.
//
// **The hearts are kept with it**, and that is the half the rules care about. A
// save that brought back the marks but not the hearts would make leaving and
// coming back a free refill: three more guesses on a board that already has the
// first three's answers written on it. The one way to fresh hearts is still the
// one there always was — start the board again, with nothing on it.
//
// What comes back from storage is **not trusted**. It is refused outright if it
// names a different puzzle (the bank is rebuilt between versions) or asserts a ✓
// on a square with no road — a ✓ is always true, and nothing, a stale save
// included, may put an unchecked one on the board. The road is drawn again
// through the rules rather than copied in (`replayRoute`).
//
// Headless like the rest of `src/game`: the hook decides *when* to save, this
// decides what a save is.

import {
  blockedTotal,
  connectComplete,
  foundTotal,
  initialMarks,
  isRoadCell,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  replayRoute,
  type Marks,
} from "./board";
import { encodePuzzle } from "./codec";
import type { Coord, Puzzle } from "./types";

/** The part of a board in play that outlives a session. */
export type BoardProgress = {
  puzzle: Puzzle;
  marks: Marks;
  route: Coord[];
  hearts: number;
  hintsUsed: number;
};

/** A board in progress, in the form it is stored. */
export type SavedBoard = {
  /** The puzzle it was played on, in `codec.ts` form — the board's identity. */
  puzzle: string;
  /** One digit per square, row-major: the `MARK_*` values. */
  marks: string;
  /** The drawn road, entry first, as `r * size + c`. */
  route: number[];
  hearts: number;
  hintsUsed: number;
};

export type RestoredBoard = Omit<BoardProgress, "puzzle">;

export function saveBoard(board: BoardProgress): SavedBoard {
  const { puzzle } = board;
  return {
    puzzle: encodePuzzle(puzzle),
    marks: Array.from(board.marks).join(""),
    route: board.route.map(({ r, c }) => r * puzzle.size + c),
    hearts: board.hearts,
    hintsUsed: board.hintsUsed,
  };
}

/**
 * Is there anything on this board a player would mind losing?
 *
 * Hearts count on their own: a refused claim writes a ✕, but the player can rub
 * that ✕ out again, and a board that looks untouched with a heart gone is still
 * one that must not come back with three.
 */
export function worthKeeping(board: BoardProgress, maxHearts: number): boolean {
  return (
    foundTotal(board.marks) > board.puzzle.fixed.length ||
    blockedTotal(board.marks) > 0 ||
    board.route.length > 0 ||
    board.hearts < maxHearts ||
    board.hintsUsed > 0
  );
}

/**
 * A stored board, checked against the puzzle it is being opened on — or null if
 * it can't be trusted, in which case the level simply opens fresh.
 *
 * A save with no hearts left is refused too: a lost board is never saved (its
 * *Try again* is a fresh board anyway), so one coming back is damaged, not lost.
 */
export function restoreBoard(
  puzzle: Puzzle,
  saved: SavedBoard,
  maxHearts: number,
): RestoredBoard | null {
  const n = puzzle.size;
  if (!saved || saved.puzzle !== encodePuzzle(puzzle)) return null;
  if (typeof saved.marks !== "string" || saved.marks.length !== n * n) return null;
  const { hearts } = saved;
  if (!Number.isInteger(hearts) || hearts < 1 || hearts > maxHearts) return null;

  // The printed pieces start claimed, and stay so whatever the save says.
  const marks = initialMarks(puzzle);
  for (let i = 0; i < n * n; i++) {
    const m = Number(saved.marks[i]);
    if (m === MARK_ROAD) {
      if (!isRoadCell(puzzle, Math.floor(i / n), i % n)) return null;
    } else if (m !== MARK_NONE && m !== MARK_BLOCKED) {
      return null;
    }
    if (marks[i] !== MARK_ROAD) marks[i] = m;
  }

  const cells: Coord[] = [];
  for (const i of Array.isArray(saved.route) ? saved.route : []) {
    if (!Number.isInteger(i) || i < 0 || i >= n * n) break;
    cells.push({ r: Math.floor(i / n), c: i % n });
  }
  let route = replayRoute(puzzle, marks, cells);
  // A finished road is a won board, and a won board is never saved — so one
  // arriving here was caught mid-commit. The last step is left to the player,
  // and the win is theirs to land.
  if (connectComplete(puzzle, route)) route = route.slice(0, -1);

  const hintsUsed =
    Number.isInteger(saved.hintsUsed) && saved.hintsUsed > 0 ? saved.hintsUsed : 0;
  return { marks, route, hearts, hintsUsed };
}
