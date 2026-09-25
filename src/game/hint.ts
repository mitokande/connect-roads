// Hints that say why.
//
// A hint used to be an answer: one road square claimed, no reason given. That
// unsticks a board and teaches nothing, and the boards that stick people are
// exactly the ones asking for a rule they have never been shown — most of the
// ladder needs reasoning well past the counting the tutorial covers. A stuck
// player paying for answers learns to pay for answers.
//
// Now a hint is **the next step a person could actually take**, found by the same
// engine that grades the boards (`nextSteps`) and said in one line: what follows,
// and from what. It can't explain a rule the game doesn't use, for the same reason
// the tutorial can't teach one — there is only the one rulebook.
//
// Before it reasons it does two things:
//
//  1. **Mistakes first.** A ✕ on a road square is the one mistake the board lets
//     stand — crosses are never checked — and it is a trap: that square can never
//     be claimed, and every step built on it is built on a false fact. A hint
//     that reasoned past it would reason from that fact too, so the first hint on
//     such a board points at the wrong ✕ and claims the square instead.
//  2. **A green line counts as swept.** A settled line's leftovers are empty, and
//     the board already says so in green. Plenty of players never bother crossing
//     them out, and they shouldn't spend a hint to be told what the sign says.
//
// What a hint does with its answer follows the board's own rules of authorship.
// Road is **claimed**: a hint that lays nothing would feel like it did nothing,
// and a claim is exactly what a hint has always been allowed to make. Empty
// squares are **pointed at, never crossed**: every ✕ on the board is the
// player's own (see "Every cross is the player's"), a hint is no exception, and
// crossing is free anyway. The tip stays up until they have.

import {
  hintCell,
  isRoadCell,
  markAt,
  MARK_BLOCKED,
  MARK_ROAD,
  shownPiece,
  type Marks,
} from "./board";
import {
  deduceInput,
  nextSteps,
  NO_ROAD,
  ROAD,
  UNKNOWN,
  type Line,
  type Step,
} from "./deduce";
import { isFogged, isScenery, same, type Coord, type Puzzle } from "./types";

/** A hint, as the board shows it. */
export type Tip = {
  /** One line for the banner; `*word*` is set bold. */
  say: string;
  /** Squares the hint claims: road, and proved. */
  claim: Coord[];
  /** Squares to ring — what the reason is about, claims included. */
  point: Coord[];
  /** The clue the reason rests on, if it rests on one. */
  line?: Line;
};

const manhattan = (a: Coord, b: Coord) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

/**
 * Where the player is working: the end of the road, or the start line before
 * there is any. Of several equally easy steps the hint takes the nearest, so it
 * lands where the reasoning was going rather than across the board.
 */
const focusOf = (puzzle: Puzzle, route: Coord[]): Coord =>
  route[route.length - 1] ?? { r: puzzle.entry.r, c: puzzle.entry.c };

const nearest = (cells: Coord[], focus: Coord) =>
  Math.min(...cells.map((c) => manhattan(c, focus)));

/** "this square" / "these squares", and the pronoun to go with it. */
const these = (k: number) => (k === 1 ? "this square" : "these squares");
const them = (k: number) => (k === 1 ? "it" : "them");

/**
 * The next hint during deduction, or null if there is nothing left to find.
 *
 * The board is read as the player has marked it: claims are road, crosses are
 * empty (once the wrong ones are dealt with), green lines are swept.
 */
export function deductionTip(puzzle: Puzzle, marks: Marks, route: Coord[]): Tip | null {
  const n = puzzle.size;
  const focus = focusOf(puzzle, route);

  // --- 1. a road square the player has crossed out ---------------------------
  const wrong: Coord[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (markAt(marks, n, r, c) === MARK_BLOCKED && isRoadCell(puzzle, r, c)) wrong.push({ r, c });
    }
  }
  if (wrong.length) {
    const cell = wrong.reduce((a, b) => (manhattan(b, focus) < manhattan(a, focus) ? b : a));
    return { say: "You ruled this out — but it's *road*", claim: [cell], point: [cell] };
  }

  // --- 2. what the player knows ----------------------------------------------
  const known = new Int8Array(n * n).fill(UNKNOWN);
  for (let i = 0; i < n * n; i++) {
    if (marks[i] === MARK_ROAD) known[i] = ROAD;
    else if (marks[i] === MARK_BLOCKED || isScenery(puzzle, Math.floor(i / n), i % n)) known[i] = NO_ROAD;
  }
  for (let i = 0; i < n; i++) {
    for (const column of [false, true]) {
      if (isFogged(puzzle, column, i)) continue; // no sign, so nothing turned green
      let found = 0;
      for (let j = 0; j < n; j++) if (known[column ? j * n + i : i * n + j] === ROAD) found++;
      if (found !== (column ? puzzle.cols[i] : puzzle.rows[i])) continue;
      for (let j = 0; j < n; j++) {
        const k = column ? j * n + i : i * n + j;
        if (known[k] === UNKNOWN) known[k] = NO_ROAD;
      }
    }
  }
  let unknownRoad = false;
  for (const { r, c } of puzzle.path) if (known[r * n + c] !== ROAD) unknownRoad = true;
  if (!unknownRoad) return null;

  // --- 3. the easiest step, nearest the work ---------------------------------
  const steps = nextSteps(deduceInput(puzzle), known)
    // A step that settles both kinds (only line intersection can) is told by its
    // road half: that is the half the hint can act on, and the other half will
    // still be there to find.
    .map((s) => (s.road.length && s.empty.length ? { ...s, empty: [] } : s));
  if (!steps.length) {
    // The engine settles every shipped board from its clues alone, and more true
    // marks only make that easier — so this is a safety net, not a path. It is the
    // hint as it used to be: a road square, without the why.
    const cell = hintCell(puzzle, marks);
    return cell ? { say: "Road goes *here*", claim: [cell], point: [cell] } : null;
  }
  const settled = (s: Step) => [...s.road, ...s.empty];
  const best = steps.reduce((a, b) => {
    const da = nearest(settled(a), focus);
    const db = nearest(settled(b), focus);
    if (da !== db) return db < da ? b : a;
    return settled(b).length > settled(a).length ? b : a;
  });
  return tipFor(best, puzzle, known);
}

/** The one line that says why, and what to ring while it is said. */
function tipFor(step: Step, puzzle: Puzzle, known: Int8Array): Tip {
  const n = puzzle.size;
  const road = step.road;
  const empty = step.empty;
  const k = road.length || empty.length;
  const onRoad = road.length > 0;
  const tip = (say: string, extra: Partial<Tip> = {}): Tip => ({
    say,
    claim: road,
    point: onRoad ? road : empty,
    ...extra,
  });

  const why = step.because;
  switch (why.rule) {
    case "count": {
      const name = why.line.column ? "column" : "row";
      const clue = why.line.column ? puzzle.cols[why.line.index] : puzzle.rows[why.line.index];
      return onRoad
        ? tip(
            `This ${name} needs *${k}* more, and only ${k === 1 ? "one square is" : `${k} squares are`} left for ${them(k)}`,
            { line: why.line },
          )
        : tip(`This ${name} has all its *${clue}* — rule out the rest`, { line: why.line });
    }
    case "exits": {
      const from = why.cell;
      const point = [from, ...road];
      if (shownPiece(puzzle, from.r, from.c) !== null) {
        return tip(`The printed road runs on *into ${k === 1 ? "here" : "these"}*`, { point });
      }
      return tip(
        k === 1
          ? "Road can't stop dead — its only *other way out* is here"
          : "Road can't stop dead — these are its only *two ways out*",
        { point },
      );
    }
    case "deadEnd":
      return tip(`A road square needs *two ways out* — ${these(k)} can't have them. Rule ${them(k)} out`);
    case "unreachable":
      return tip(`The road can't reach ${these(k)} from the start — rule ${them(k)} *out*`);
    case "bottleneck":
      return tip("The road can't reach the flag *without* this square");
    case "overlap": {
      const { column, index } = why.line;
      const name = column ? "column" : "row";
      const clue = column ? puzzle.cols[index] : puzzle.rows[index];
      let found = 0;
      for (let j = 0; j < n; j++) if (known[column ? j * n + index : index * n + j] === ROAD) found++;
      const need = clue - found;
      const owed = need === clue ? `this ${name}'s *${clue}*` : `this ${name}'s last *${need}*`;
      return onRoad
        ? tip(`Every way to place ${owed} puts road here`, { line: why.line })
        : tip(`No way to place ${owed} uses ${these(k)} — rule ${them(k)} out`, { line: why.line });
    }
    case "refute":
      return onRoad
        ? tip("If this were empty, the numbers couldn't add up — so it's *road*")
        : tip("If this held road, the numbers couldn't add up — rule it *out*");
  }
}

/**
 * The next hint while connecting: the route as far as it follows the solution,
 * plus one more square of it. A road that took a wrong turn somewhere through the
 * claimed squares is wound back to the turn first — that is the connecting
 * phase's version of a mistake, and the only way to be stuck in it.
 */
export function routeTip(puzzle: Puzzle, route: Coord[]): { route: Coord[]; tip: Tip } | null {
  const { path } = puzzle;
  let ok = 0;
  while (ok < route.length && ok < path.length && same(route[ok], path[ok])) ok++;
  if (ok >= path.length) return null;
  const next = path[ok];
  return {
    route: path.slice(0, ok + 1),
    tip: {
      say: ok < route.length ? "Wrong turn — the road goes *this way*" : "The road goes on *this way*",
      claim: [],
      point: [next],
    },
  };
}
