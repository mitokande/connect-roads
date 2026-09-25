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
//
// That is the *basics*, and it is all counting. Most of the ladder asks for more,
// so the harder rules are taught the same way, later, and only when they are
// needed: each `Technique` is a short course shown once, just before the first
// level whose board needs its rule (see `TECHNIQUES`).

import { decodePuzzle } from "./codec";
import type { Tier } from "./deduce";
import type { Coord, Puzzle } from "./types";

/** What the hand demonstrates. The screen resolves it against the live board. */
export type Gesture =
  | { kind: "point"; axis: "row" | "col"; index: number }
  /** Point at one square — what a reason is about, before anything is done to it. */
  | { kind: "square"; cell: Coord }
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
  /**
   * Start part-way through: one digit per square, the `MARK_*` values. A
   * technique is taught at the moment it is needed, which is after everything
   * easier has been done — so its board opens with that already on it.
   */
  marks?: string;
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

/**
 * A rule the basics don't cover, taught just before it is first needed.
 *
 * The basics are counting, and counting carries a player only as far as level 1:
 * level 2 already needs "two ways out", level 20 the line-by-line trial the engine
 * calls intersection, and level 113 a what-if. Nothing used to show any of it —
 * the ladder simply started asking. Each course is a board or two built so that
 * the rule is the *only* move left (everything easier is already on the board),
 * run through the game's own reducer like the basics.
 *
 * `npm test` holds each one to its word: the lesson board needs exactly this
 * rule and nothing easier; the squares it asks for are the ones the rule proves;
 * and `firstLevel` really is the first shipped board that can't be done without
 * it — so moving the ladder moves the lesson, or the tests say so.
 */
export type Technique = {
  id: "exits" | "overlap" | "whatif" | "scenery" | "fog";
  /**
   * A `rule` of reasoning the engine grades boards by — or a `twist`, something
   * a band's boards themselves carry (the mountains' scenery and fog). A twist is
   * taught before its band like a rule before its level, but a daily never asks
   * for one, because no daily carries one.
   */
  kind: "rule" | "twist";
  /** What the trick is called, on the card that ends it and in the help. */
  name: string;
  /** The rule in one line; `*word*` is set bold. */
  rule: string;
  /**
   * The engine rule it teaches (`deduce.ts`) — for a twist, the rule its lesson
   * asks for, which is never more than the basics and two-ways-out.
   */
  tier: Tier;
  /** The first level that needs it: the course is shown before that level opens. */
  firstLevel: number;
  lessons: Lesson[];
};

export const TECHNIQUES: Technique[] = [
  {
    id: "exits",
    kind: "rule",
    name: "Two ways out",
    rule: "Road never stops dead: every road square joins *two* neighbours",
    tier: 2,
    firstLevel: 2,
    lessons: [
      {
        // The full rows are in. The top-left corner is road, it has used one of
        // its two neighbours, and the square below it is the only one left.
        board: "4|3,3,2|0,3,1|15.11.10.14.13.9.8.4.0.1.2.3|0.11",
        marks: "1111000211110001",
        steps: [
          {
            say: "Every road square joins *two* neighbours — one in, one out",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(0, 0) },
          },
          {
            say: "This corner has one way left to go — *double tap* it",
            goal: { kind: "claim", cells: [at(1, 0)] },
            gesture: { kind: "double" },
          },
          {
            say: "Your turn — find the rest",
            goal: { kind: "solve" },
            gesture: { kind: "double" },
            idle: true,
          },
        ],
      },
      {
        // The same rule, the other way round: the bottom-left corner has road
        // above it and a ✕ beside it, so road could get in but never out.
        board: "5|4,4,1|0,0,3|24.19.18.23.22.17.16.15.10.5.6.7.8.9.4.3.2.1.0|0.18",
        marks: "1111111111020021111102001",
        steps: [
          {
            say: "A square with only *one* way in can't hold road",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(4, 0) },
          },
          {
            say: "Road here would stop dead — *tap* to rule it out",
            goal: { kind: "cross", cells: [at(4, 0)] },
            gesture: { kind: "tap" },
          },
          {
            say: "Your turn — find the rest",
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
    ],
  },
  {
    id: "overlap",
    kind: "rule",
    name: "Try each way",
    rule: "If a line's road could go a few ways, *try each* — any that breaks is out",
    tier: 4,
    firstLevel: 20,
    lessons: [
      {
        // The second column owes one square, and there are two gaps. Put it in
        // the top one and the bottom one stays empty — which walls the top one in
        // on three sides. So it is the bottom one.
        board: "5|0,0,3|4,0,2|0.1.2.7.12.13.8.9.14.19.24.23.22.17.16.21.20|0.16",
        marks: "1112222111201012010111111",
        steps: [
          {
            say: "This column needs *one* more: the top gap or the bottom one",
            goal: { kind: "next" },
            gesture: { kind: "point", axis: "col", index: 1 },
          },
          {
            say: "Try the *top*: the bottom stays empty, and road up here would stop dead",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(2, 1) },
          },
          {
            say: "So it's the *bottom* one — double tap it",
            goal: { kind: "claim", cells: [at(3, 1)] },
            gesture: { kind: "double" },
          },
          {
            say: "…and the top one is empty. *Tap* it",
            goal: { kind: "cross", cells: [at(2, 1)] },
            gesture: { kind: "tap" },
          },
          {
            say: "Your turn — find the rest",
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
    ],
  },
  {
    id: "whatif",
    kind: "rule",
    name: "What if?",
    rule: "Stuck? *Suppose* a square and follow it through — if it breaks, the opposite is true",
    tier: 5,
    firstLevel: 113,
    lessons: [
      {
        // Suppose the top row's middle gap is empty. Then the row's last road
        // must go next door; that fills its column, which empties the square
        // below — and the road there is walled in, because the printed piece
        // beside it turns away. Impossible, so the gap is road.
        board: "5|3,0,3|0,4,1|15.20.21.16.11.10.5.0.1.2.7.8.13.14.9.4|0.15",
        marks: "1100110001100111122211222",
        steps: [
          {
            say: "Stuck? Ask *what if*. What if this square were empty?",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(0, 2) },
          },
          {
            say: "Then this row's last road would have to go *here*…",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(0, 3) },
          },
          {
            say: "…which fills this column, so the square below goes empty…",
            goal: { kind: "next" },
            gesture: { kind: "point", axis: "col", index: 3 },
          },
          {
            say: "…and road here would have *no way on*. That can't be!",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(0, 3) },
          },
          {
            say: "So it isn't empty — it's *road*. Double tap it",
            goal: { kind: "claim", cells: [at(0, 2)] },
            gesture: { kind: "double" },
          },
          {
            say: "Your turn — find the rest",
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
    ],
  },
  // The mountains' twists, taught at the foot of each band. Both lessons open
  // with the board nearly done, so the one new idea is the whole lesson.
  {
    id: "scenery",
    kind: "twist",
    name: "Rocks & pines",
    rule: "Rocks, pines and lakes are printed on the board — *no road* goes through them",
    tier: 2,
    firstLevel: 121,
    lessons: [
      {
        // The second column owes 3 and two of its five squares are scenery: the
        // three left are road.
        board: "5|0,3,0|2,4,1|3.2.7.12.11.10.15.20.21.16.17.18.19.14|0.13|6.1.24",
        marks: "2011220122101211011110220",
        steps: [
          {
            say: "Up in the mountains, rocks and pines hold *no road*",
            goal: { kind: "next" },
            gesture: { kind: "square", cell: at(0, 1) },
          },
          {
            say: "This column needs *3*, and two of its squares are taken — double tap the rest",
            goal: { kind: "claim", cells: [at(2, 1), at(3, 1), at(4, 1)] },
            gesture: { kind: "double" },
          },
          {
            say: "*Drag* the road to the flag",
            goal: { kind: "drive" },
            gesture: { kind: "drag" },
          },
        ],
      },
    ],
  },
  {
    id: "fog",
    kind: "twist",
    name: "Fog",
    rule: "A *?* hides a line's count — the lines crossing it still know theirs",
    tier: 2,
    firstLevel: 136,
    lessons: [
      {
        // The second column is fogged; everything but it is filled in. Each of
        // its squares is settled by its own row's count instead.
        board: "5|4,1,2|3,0,3|21.22.17.12.13.14.9.8.3.2.7.6.11.10.15|0.14||c1.4",
        marks: "2011220111101111012221122",
        steps: [
          {
            say: "Fog hides this column's count — a *?* could be anything",
            goal: { kind: "next" },
            gesture: { kind: "point", axis: "col", index: 1 },
          },
          {
            say: "But its rows still count: this one needs *4* and has 3 — double tap",
            goal: { kind: "claim", cells: [at(1, 1)] },
            gesture: { kind: "double" },
          },
          {
            say: "Your turn — finish the column",
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
    ],
  },
];

/**
 * The course to show before opening `level`, if one is owed: the earliest trick
 * the level needs that the player hasn't been shown. One at a time — a player
 * arriving owed several (progress from before they existed) meets them in order,
 * one per opening.
 */
export function techniqueDue(level: number, learned: readonly string[]): Technique | null {
  return TECHNIQUES.find((t) => level >= t.firstLevel && !learned.includes(t.id)) ?? null;
}

/**
 * The same, for a board that isn't on the ladder (a daily): the earliest trick
 * at or below the rule the board actually needs that the player hasn't been
 * shown. A daily can reach a rule before the ladder does, and is taught it then.
 */
export function techniqueFor(tier: Tier, learned: readonly string[]): Technique | null {
  return TECHNIQUES.find((t) => t.kind === "rule" && t.tier <= tier && !learned.includes(t.id)) ?? null;
}

const cache = new Map<string, Puzzle>();

/**
 * The board a lesson is played on. Seeded apart from every real level (the seed
 * only picks the town that grows round a finished road).
 */
export function lessonPuzzle(lesson: Lesson): Puzzle {
  const hit = cache.get(lesson.board);
  if (hit) return hit;
  let seed = 0x7e57;
  for (let i = 0; i < lesson.board.length; i++) seed = (Math.imul(seed, 31) + lesson.board.charCodeAt(i)) >>> 0;
  const puzzle = decodePuzzle(lesson.board, seed);
  cache.set(lesson.board, puzzle);
  return puzzle;
}
