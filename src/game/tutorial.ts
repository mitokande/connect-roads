// The tutorial, as data: four tiny boards and what the player is asked to do on
// each, one move at a time.
//
// It is a script rather than a coach because the rules are gestures, and a
// gesture is learnt by doing it on the square the game is pointing at, not by
// reading a paragraph about it. Every step names one **goal** the board can check
// on its own (claim these squares, cross those out, finish the road), and the
// screen gates input to that goal — so a step can never be skipped by accident,
// and the player can never be a step ahead of the lesson or stuck behind it.
//
// Headless like the rest of `src/game`: the screen supplies the hand and the
// words' styling, and `npm test` proves every scripted move is the true one.
//
// The order is the order a player needs the ideas in:
//   1. the goal       a road from the start line to the flag (and the payoff)
//   2. the numbers    a clue counts road squares; double tap claims one
//   3. ruling out     a full line's rest is crossed out, which forces the rest
//   4. road that builds as it goes

import { decodePuzzle } from "./codec";
import type { Coord, Puzzle } from "./types";

/** What the hand demonstrates. The screen resolves it against the live board. */
export type Gesture =
  | { kind: "point"; axis: "row" | "col"; index: number }
  /** Double tap on the goal's first square still to do. */
  | { kind: "double" }
  /** A single tap on the goal's first square still to do. */
  | { kind: "tap" }
  /** One stroke through every goal square still to do. */
  | { kind: "swipe" }
  /** Along the solution, from wherever the road has got to. */
  | { kind: "drag" };

/** What finishes a step, and therefore which moves it accepts. */
export type Goal =
  /** Nothing on the board — the player reads and presses Next. */
  | { kind: "next" }
  | { kind: "claim"; cells: Coord[] }
  | { kind: "cross"; cells: Coord[] }
  /** Any deduction move; done when every road square is found. */
  | { kind: "solve" }
  /** Lay the road to the flag; done when the convoy has driven it. */
  | { kind: "drive" };

export type TutorialStep = {
  /** One line. `*word*` is set bold. */
  say: string;
  goal: Goal;
  gesture?: Gesture;
  /** Hold the hand back until the player has been idle a while — their turn. */
  idle?: boolean;
};

export type Lesson = {
  /** `codec.ts` format. */
  board: string;
  /** Start with every road square already claimed. */
  claimed?: boolean;
  steps: TutorialStep[];
};

const at = (r: number, c: number): Coord => ({ r, c });

export const LESSONS: Lesson[] = [
  {
    // Down from the top, across, down to the flag. Every square is already
    // claimed, so the only thing to do is the thing the whole game is for.
    board: "3|0,0,0|2,2,2|0.3.4.5.8|0.4",
    claimed: true,
    steps: [
      {
        say: "*Drag* the road from the start to the flag",
        goal: { kind: "drive" },
        gesture: { kind: "drag" },
      },
    ],
  },
  {
    // The middle column is a 3 on a 3-wide board: the whole of it is road.
    board: "3|0,0,3|2,2,1|0.1.4.7.8|0.4",
    steps: [
      {
        say: "Numbers count the *road squares* in a line",
        goal: { kind: "next" },
        gesture: { kind: "point", axis: "col", index: 1 },
      },
      {
        say: "This column needs 3. *Double tap* to build road",
        goal: { kind: "claim", cells: [at(0, 1), at(1, 1), at(2, 1)] },
        gesture: { kind: "double" },
      },
      {
        say: "All found! *Drag* the road to the flag",
        goal: { kind: "drive" },
        gesture: { kind: "drag" },
      },
    ],
  },
  {
    // The top row's 1 is met by the printed start, so its rest is empty; so is
    // the right column's. That leaves the middle row exactly two squares for its
    // 2 — the chain the whole game is built from, in four moves.
    board: "3|0,0,0|2,2,1|0.3.4.7.8|0.4",
    steps: [
      {
        say: "A *green* number is full — no more road in that line",
        goal: { kind: "next" },
        gesture: { kind: "point", axis: "row", index: 0 },
      },
      {
        say: "*Swipe* across the rest to rule them out",
        goal: { kind: "cross", cells: [at(0, 1), at(0, 2)] },
        gesture: { kind: "swipe" },
      },
      {
        say: "Or *tap* one square",
        goal: { kind: "cross", cells: [at(1, 2)] },
        gesture: { kind: "tap" },
      },
      {
        say: "2 squares left for a 2 — *both* are road",
        goal: { kind: "claim", cells: [at(1, 0), at(1, 1)] },
        gesture: { kind: "double" },
      },
      {
        say: "Your turn — find the last road square",
        goal: { kind: "solve" },
        gesture: { kind: "double" },
        idle: true,
      },
      {
        say: "*Drag* the road to the flag",
        goal: { kind: "drive" },
        gesture: { kind: "drag" },
      },
    ],
  },
  {
    // Nothing claimed, and nothing needs to be: the printed start points
    // straight down a column of 3, and the bottom row is a 3.
    board: "3|0,0,0|2,2,1|0.3.6.7.8|0.4",
    steps: [
      {
        say: "*Drag* into new squares to build as you go",
        goal: { kind: "drive" },
        gesture: { kind: "drag" },
      },
    ],
  },
];

const cache = new Map<number, Puzzle>();

/** The board a lesson is played on. Seeded apart from every real level. */
export function lessonPuzzle(index: number): Puzzle {
  const hit = cache.get(index);
  if (hit) return hit;
  const puzzle = decodePuzzle(LESSONS[index].board, 0x7e57 + index);
  cache.set(index, puzzle);
  return puzzle;
}
